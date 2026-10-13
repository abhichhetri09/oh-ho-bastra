package types

import db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"

// The max=10 bindings match cart.MaxLineQuantity.

type AddCartItemRequest struct {
	VariantID string `json:"variant_id" binding:"required,uuid"`
	Quantity  int    `json:"quantity" binding:"required,min=1,max=10"`
}

type UpdateCartItemRequest struct {
	Quantity int `json:"quantity" binding:"required,min=1,max=10"`
}

// CartLine is one cart item, priced live.
type CartLine struct {
	db.GetCartLinesRow
	// LineTotal is price × quantity.
	LineTotal int64 `json:"line_total"`
	// MaxQuantity is what the line can be raised to: the stock, capped at
	// the per-line limit (0 when it can't be bought).
	MaxQuantity int32 `json:"max_quantity"`
}

type Cart struct {
	Items []CartLine `json:"items"`
	// ItemCount and Subtotal count the lines that can be checked out.
	ItemCount int   `json:"item_count"`
	Subtotal  int64 `json:"subtotal"`
	// HasIssues is true when a line is unavailable or above its stock;
	// checkout refuses until the shopper fixes it.
	HasIssues bool `json:"has_issues"`
}
