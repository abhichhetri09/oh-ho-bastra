package emails

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

var placed = time.Date(2026, 10, 11, 9, 30, 0, 0, time.UTC)

func testOrder() db.Order {
	return db.Order{
		ID:              pgtype.UUID{Bytes: [16]byte{1}, Valid: true},
		Number:          1042,
		Subtotal:        123450,
		Shipping:        800,
		Total:           124250,
		Currency:        "usd",
		Email:           "ada@example.com",
		ShippingAddress: []byte(`{"full_name":"Ada Lovelace","phone":"5550100","line1":"1 Loom Lane","line2":"","city":"London","region":"","postal_code":"N1 9GU","country":"GB"}`),
		TrackingNumber:  pgtype.Text{String: "1Z999AA10123456784", Valid: true},
		CreatedAt:       pgtype.Timestamptz{Time: placed, Valid: true},
	}
}

func testItems() []db.OrderItem {
	return []db.OrderItem{
		{ProductName: `Wool <script>alert(1)</script> scarf`, Options: []byte(`[{"name":"color","value":"Oat"},{"name":"size","value":"One size"}]`),
			Quantity: 2, LineTotal: 9000, Image: "https://res.cloudinary.com/demo/image/upload/c_fill,ar_4:5/scarf.jpg"},
		{ProductName: "Mug", Options: []byte(`[]`), Quantity: 1, LineTotal: 1450},
	}
}

func TestRender(t *testing.T) {
	r, err := Render(OrderShipped, testOrder(), "Ada Lovelace", testItems(), "http://localhost:3000")
	if err != nil {
		t.Fatal(err)
	}
	if r.Subject != "Your order OHB-1042 is on its way" {
		t.Errorf("subject = %q", r.Subject)
	}
	for _, part := range []struct{ name, body string }{{"html", r.HTML}, {"text", r.Text}} {
		for _, want := range []string{
			"OHB-1042", "Hi Ada,", "1Z999AA10123456784", "$1,234.50", "$8.00", "$1,242.50",
			"http://localhost:3000/account/orders/OHB-1042", "Oat / One size", "London N1 9GU", "United Kingdom",
		} {
			if !strings.Contains(part.body, want) {
				t.Errorf("%s part lacks %q", part.name, want)
			}
		}
	}
	if strings.Contains(r.HTML, "<script>") || !strings.Contains(r.HTML, "&lt;script&gt;") {
		t.Error("product names must be escaped in html")
	}
	if !strings.Contains(r.HTML, "/image/upload/c_fill,g_auto,w_128,h_160,f_jpg,q_auto/c_fill,ar_4:5/scarf.jpg") {
		t.Error("product image should be a jpeg thumbnail")
	}
	if !strings.Contains(r.HTML, `src="http://localhost:3000/email/mark.png"`) {
		t.Error("the header should show the logo mark from the storefront")
	}
	if !strings.Contains(r.HTML, "11 October 2026") {
		t.Error("placed date missing")
	}
}

func TestRenderKinds(t *testing.T) {
	order := testOrder()
	order.Shipping = 0
	for kind, subject := range map[string]string{
		OrderConfirmed: "Your order OHB-1042 is confirmed",
		OrderRefunded:  "Your order OHB-1042 has been refunded",
	} {
		r, err := Render(kind, order, "", nil, "https://shop.example")
		if err != nil {
			t.Fatal(err)
		}
		if r.Subject != subject {
			t.Errorf("%s subject = %q", kind, r.Subject)
		}
		// Tracking belongs to the shipped email only.
		if strings.Contains(r.Text, "1Z999AA10123456784") {
			t.Errorf("%s shows the tracking number", kind)
		}
		if !strings.Contains(r.Text, "Hi,") || !strings.Contains(r.Text, "Shipping  Free") {
			t.Errorf("%s text:\n%s", kind, r.Text)
		}
	}
	if _, err := Render("order_lost", order, "", nil, ""); err == nil {
		t.Error("an unknown kind must fail")
	}
}

func TestAddressLines(t *testing.T) {
	got := addressLines([]byte(`{"full_name":"Grace Hopper","line1":"1 Main St","line2":"Apt 2","city":"Austin","region":"TX","postal_code":"78701","country":"US"}`))
	want := []string{"Grace Hopper", "1 Main St", "Apt 2", "Austin, TX 78701", "United States"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("got %q", got)
	}
	if addressLines([]byte(`not json`)) != nil {
		t.Error("a bad snapshot gives no address")
	}
}

func TestFormatMoney(t *testing.T) {
	for cents, want := range map[int64]string{0: "$0.00", 5: "$0.05", 2900: "$29.00", 123456789: "$1,234,567.89", -1050: "-$10.50"} {
		if got := FormatMoney(cents, "usd"); got != want {
			t.Errorf("FormatMoney(%d) = %q, want %q", cents, got, want)
		}
	}
	if got := FormatMoney(123450, "eur"); got != "€1,234.50" {
		t.Errorf("FormatMoney(123450, eur) = %q", got)
	}
	if got := FormatMoney(250000, "gbp"); got != "2,500.00 GBP" {
		t.Errorf("gbp = %q", got)
	}
}

func TestBackoff(t *testing.T) {
	want := []time.Duration{time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute,
		16 * time.Minute, 32 * time.Minute, time.Hour, time.Hour}
	for i, w := range want {
		if got := backoff(int32(i + 1)); got != w {
			t.Errorf("backoff(%d) = %v, want %v", i+1, got, w)
		}
	}
}

func TestErrorTextKeepsUTF8(t *testing.T) {
	s := strings.Repeat("a", lastErrorLen-1) + "é"
	got := errorText(s).String
	if len(got) != lastErrorLen-1 || !strings.HasPrefix(s, got) {
		t.Errorf("cut at %d bytes", len(got))
	}
}

// fakeStore keeps one claimable email and records what the worker did.
type fakeStore struct {
	row      db.EmailOutbox
	orderErr error
	claimed  bool
	sent     bool
	retryIn  int32
	failed   string
}

func (f *fakeStore) ClaimDueEmails(context.Context, db.ClaimDueEmailsParams) ([]db.EmailOutbox, error) {
	if f.claimed {
		return nil, nil
	}
	f.claimed = true
	return []db.EmailOutbox{f.row}, nil
}
func (f *fakeStore) GetEmailOrder(context.Context, pgtype.UUID) (db.GetEmailOrderRow, error) {
	if f.orderErr != nil {
		return db.GetEmailOrderRow{}, f.orderErr
	}
	return db.GetEmailOrderRow{Order: testOrder(), CustomerName: "Ada"}, nil
}
func (f *fakeStore) GetOrderItems(context.Context, pgtype.UUID) ([]db.OrderItem, error) {
	return testItems(), nil
}
func (f *fakeStore) MarkEmailSent(context.Context, pgtype.UUID) error { f.sent = true; return nil }
func (f *fakeStore) RetryEmail(_ context.Context, arg db.RetryEmailParams) error {
	f.retryIn = arg.DelaySeconds
	return nil
}
func (f *fakeStore) FailEmail(_ context.Context, arg db.FailEmailParams) error {
	f.failed = arg.LastError.String
	return nil
}

type fakeSender struct {
	err    error
	sent   []Message
	onSend func()
}

func (f *fakeSender) Send(_ context.Context, m Message) error {
	if f.onSend != nil {
		f.onSend()
	}
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, m)
	return nil
}

func TestWorker(t *testing.T) {
	now := placed.Add(time.Hour)
	fresh := db.EmailOutbox{Kind: OrderConfirmed, Attempts: 1, CreatedAt: pgtype.Timestamptz{Time: placed, Valid: true}}

	tests := []struct {
		name      string
		row       func(r db.EmailOutbox) db.EmailOutbox
		sendErr   error
		orderErr  error
		cancelled bool
		wantSent  bool
		wantRetry int32
		wantFail  bool
	}{
		{name: "sent", wantSent: true},
		{name: "retried with backoff", row: func(r db.EmailOutbox) db.EmailOutbox { r.Attempts = 3; return r },
			sendErr: errors.New("dial: connection refused"), wantRetry: 4 * 60},
		{name: "refused for good", sendErr: &PermanentError{errors.New("550 no such user")}, wantFail: true},
		{name: "out of attempts", row: func(r db.EmailOutbox) db.EmailOutbox { r.Attempts = maxAttempts; return r },
			sendErr: errors.New("timeout"), wantFail: true},
		{name: "too old", row: func(r db.EmailOutbox) db.EmailOutbox {
			r.CreatedAt.Time = now.Add(-maxAge - time.Minute)
			return r
		}, wantFail: true},
		{name: "old but requeued by an admin", row: func(r db.EmailOutbox) db.EmailOutbox {
			r.CreatedAt.Time = now.Add(-maxAge - time.Hour)
			r.RequeuedAt = pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}
			return r
		}, wantSent: true},
		{name: "unknown kind", row: func(r db.EmailOutbox) db.EmailOutbox { r.Kind = "order_lost"; return r }, wantFail: true},
		{name: "database blip retries", orderErr: errors.New("conn reset"), wantRetry: 60},
		{name: "shutdown leaves it to the lease", cancelled: true, sendErr: context.Canceled},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			row := fresh
			if tt.row != nil {
				row = tt.row(row)
			}
			store := &fakeStore{row: row, orderErr: tt.orderErr}
			sender := &fakeSender{err: tt.sendErr}
			w := &Worker{store: store, sender: sender, frontendURL: "http://localhost:3000", now: func() time.Time { return now }}

			ctx := context.Background()
			if tt.cancelled {
				// Cancelled mid-send: the claim already happened.
				c, cancel := context.WithCancel(ctx)
				sender.onSend = cancel
				ctx = c
			}
			n, err := w.SendDue(ctx)
			if err != nil || n != 1 {
				t.Fatalf("SendDue = %d, %v", n, err)
			}
			if store.sent != tt.wantSent || store.retryIn != tt.wantRetry || (store.failed != "") != tt.wantFail {
				t.Errorf("sent=%v retryIn=%d failed=%q", store.sent, store.retryIn, store.failed)
			}
			if tt.wantSent && (len(sender.sent) != 1 || sender.sent[0].To != "ada@example.com" ||
				sender.sent[0].Subject != "Your order OHB-1042 is confirmed") {
				t.Errorf("message = %+v", sender.sent)
			}
		})
	}
}

func TestRenderPasswordReset(t *testing.T) {
	r, err := RenderPasswordReset("Ada Lovelace", "tok+/=en", "https://shop.example/")
	if err != nil {
		t.Fatal(err)
	}
	link := "https://shop.example/auth/reset?token=tok%2B%2F%3Den"
	if !strings.Contains(r.Text, link) || !strings.Contains(r.HTML, link) {
		t.Errorf("reset link missing or unescaped:\n%s", r.Text)
	}
	if !strings.Contains(r.Text, "Hi Ada,") || r.Subject != "Reset your Oh Ho Bastra password" {
		t.Errorf("unexpected copy: %q / %q", r.Subject, r.Text)
	}
}
