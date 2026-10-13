package emails

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	htmltemplate "html/template"
	"strings"
	texttemplate "text/template"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

// StoreName signs the emails; it matches the storefront's wordmark.
const StoreName = "Oh Ho Bastra"

//go:embed templates
var templateFS embed.FS

var (
	htmlTemplates = htmltemplate.Must(htmltemplate.ParseFS(templateFS, "templates/*.html.tmpl"))
	textTemplates = texttemplate.Must(texttemplate.ParseFS(templateFS, "templates/*.txt.tmpl"))
)

// copyFor is what each kind of email says around the order.
type copyFor struct {
	Subject   string // %s is the order label
	Preheader string // the inbox preview line
	Heading   string
	Intro     string
}

var copies = map[string]copyFor{
	OrderConfirmed: {
		Subject:   "Your order %s is confirmed",
		Preheader: "Thank you for your order. We'll let you know when it ships.",
		Heading:   "Thank you for your order",
		Intro:     "We've received your payment and are getting your order ready. We'll email you again as soon as it ships.",
	},
	OrderShipped: {
		Subject:   "Your order %s is on its way",
		Preheader: "Your order has left the studio.",
		Heading:   "Your order is on its way",
		Intro:     "Good news: your order has left the studio and is on its way to you.",
	},
	OrderRefunded: {
		Subject:   "Your order %s has been refunded",
		Preheader: "Your refund is on its way back to you.",
		Heading:   "Your order has been refunded",
		Intro:     "We've refunded your order in full to your original payment method. Depending on your bank, it can take 5–10 business days to appear.",
	},
}

// Order is the order an email is about, as the templates see it.
type Order struct {
	Kind      string
	StoreName string
	Preheader string
	Heading   string
	Intro     string
	Greeting  string // "Hi Ada,"
	Label     string // "OHB-1001"
	PlacedOn  string
	URL       string // the order on the storefront
	ShopURL   string
	Items     []Item
	Subtotal  string
	Shipping  string
	Total     string
	Tracking  string
	Address   []string // the shipping address, one line each
}

type Item struct {
	Name      string
	Options   string // "Black / M"
	Quantity  int32
	LineTotal string
	Image     string
}

// Rendered is an email ready to send.
type Rendered struct {
	Subject string
	HTML    string
	Text    string
}

// Render builds the email of the given kind for an order.
func Render(kind string, order db.Order, customerName string, items []db.OrderItem, frontendURL string) (Rendered, error) {
	c, ok := copies[kind]
	if !ok {
		return Rendered{}, fmt.Errorf("unknown email kind %q", kind)
	}

	label := OrderLabel(order.Number)
	view := Order{
		Kind:      kind,
		StoreName: StoreName,
		Preheader: c.Preheader,
		Heading:   c.Heading,
		Intro:     c.Intro,
		Greeting:  greeting(customerName),
		Label:     label,
		URL:       frontendURL + "/account/orders/" + label,
		ShopURL:   frontendURL,
		Subtotal:  FormatMoney(int64(order.Subtotal), order.Currency),
		Shipping:  FormatMoney(int64(order.Shipping), order.Currency),
		Total:     FormatMoney(int64(order.Total), order.Currency),
		Address:   addressLines(order.ShippingAddress),
	}
	if order.CreatedAt.Valid {
		view.PlacedOn = order.CreatedAt.Time.UTC().Format("2 January 2006")
	}
	if order.Shipping == 0 {
		view.Shipping = "Free"
	}
	if kind == OrderShipped && order.TrackingNumber.Valid {
		view.Tracking = order.TrackingNumber.String
	}
	for _, it := range items {
		view.Items = append(view.Items, Item{
			Name:      it.ProductName,
			Options:   optionValues(it.Options),
			Quantity:  it.Quantity,
			LineTotal: FormatMoney(int64(it.LineTotal), order.Currency),
			Image:     thumbnail(it.Image),
		})
	}

	var html, text bytes.Buffer
	if err := htmlTemplates.ExecuteTemplate(&html, "email.html.tmpl", view); err != nil {
		return Rendered{}, fmt.Errorf("render html: %w", err)
	}
	if err := textTemplates.ExecuteTemplate(&text, "email.txt.tmpl", view); err != nil {
		return Rendered{}, fmt.Errorf("render text: %w", err)
	}
	return Rendered{
		Subject: fmt.Sprintf(c.Subject, label),
		HTML:    html.String(),
		Text:    text.String(),
	}, nil
}

// OrderLabel is the customer-facing order number, as the storefront shows it.
func OrderLabel(number int64) string { return fmt.Sprintf("OHB-%d", number) }

var currencySymbols = map[string]string{"eur": "€", "usd": "$"}

// FormatMoney formats minor units: 123456 eur → "€1,234.56".
func FormatMoney(cents int64, currency string) string {
	sign := ""
	if cents < 0 {
		sign, cents = "-", -cents
	}
	whole := fmt.Sprint(cents / 100)
	for i := len(whole) - 3; i > 0; i -= 3 {
		whole = whole[:i] + "," + whole[i:]
	}
	amount := fmt.Sprintf("%s.%02d", whole, cents%100)
	if symbol, ok := currencySymbols[strings.ToLower(currency)]; ok {
		return sign + symbol + amount
	}
	return sign + amount + " " + strings.ToUpper(currency)
}

func greeting(name string) string {
	first, _, _ := strings.Cut(strings.TrimSpace(name), " ")
	if first == "" {
		return "Hi,"
	}
	return "Hi " + first + ","
}

// optionValues joins an order item's option snapshot: "Black / M".
func optionValues(raw json.RawMessage) string {
	var opts []struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &opts); err != nil {
		return ""
	}
	values := make([]string, 0, len(opts))
	for _, o := range opts {
		if o.Value != "" {
			values = append(values, o.Value)
		}
	}
	return strings.Join(values, " / ")
}

var countryNames = map[string]string{
	"FI": "Finland", "US": "United States", "CA": "Canada", "GB": "United Kingdom", "IE": "Ireland",
	"DE": "Germany", "FR": "France", "NL": "Netherlands", "AU": "Australia",
	"NZ": "New Zealand", "NP": "Nepal", "IN": "India", "JP": "Japan",
}

// addressLines lays out the order's shipping address snapshot.
func addressLines(raw json.RawMessage) []string {
	var a types.AddressInput
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil
	}
	// "London NW1 6XE", "Austin, TX 78701": as the storefront writes it.
	city := strings.Join(nonEmpty(strings.Join(nonEmpty(a.City, a.Region), ", "), a.PostalCode), " ")
	country := countryNames[a.Country]
	if country == "" {
		country = a.Country
	}
	return nonEmpty(a.FullName, a.Line1, a.Line2, city, country)
}

func nonEmpty(parts ...string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// thumbnail asks Cloudinary for a small JPEG of a product image (Outlook
// can't show WebP or AVIF); other URLs are used as they are.
func thumbnail(url string) string {
	if !strings.Contains(url, "res.cloudinary.com/") || !strings.Contains(url, "/image/upload/") {
		return url
	}
	return strings.Replace(url, "/image/upload/", "/image/upload/c_fill,g_auto,w_128,h_160,f_jpg,q_auto/", 1)
}
