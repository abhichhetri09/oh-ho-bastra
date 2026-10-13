package types

import (
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

// ShippingCountries are the ISO codes checkout ships to (the oneof below).
var ShippingCountries = []string{"FI", "US", "CA", "GB", "IE", "DE", "FR", "NL", "AU", "NZ", "NP", "IN", "JP"}

type AddressInput struct {
	FullName   string `json:"full_name" binding:"required,not_blank,max=80"`
	Phone      string `json:"phone" binding:"required,not_blank,min=6,max=20"`
	Line1      string `json:"line1" binding:"required,not_blank,max=120"`
	Line2      string `json:"line2" binding:"max=120"`
	City       string `json:"city" binding:"required,not_blank,max=80"`
	Region     string `json:"region" binding:"max=80"`
	PostalCode string `json:"postal_code" binding:"required,not_blank,max=12"`
	Country    string `json:"country" binding:"required,oneof=FI US CA GB IE DE FR NL AU NZ NP IN JP"`
}

// CheckoutRequest ships to a saved address or a new one (exactly one).
type CheckoutRequest struct {
	AddressID string        `json:"address_id" binding:"omitempty,uuid"`
	Address   *AddressInput `json:"address"`
	// SaveAddress adds a new address to the address book.
	SaveAddress bool `json:"save_address"`
	// MakeDefault, with SaveAddress, makes the new address the default.
	MakeDefault bool `json:"make_default"`
}

type CheckoutResponse struct {
	OrderNumber int64  `json:"order_number"`
	CheckoutURL string `json:"checkout_url"`
}

// OrderDetail is an order with what was bought, and which of its products
// the customer has reviewed (never null).
type OrderDetail struct {
	db.Order
	Items              []db.OrderItem `json:"items"`
	ReviewedProductIDs []pgtype.UUID  `json:"reviewed_product_ids"`
}
