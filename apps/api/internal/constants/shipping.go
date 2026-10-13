package constants

// Shipping, in cents. apps/web/lib/shipping.ts shows the same rule.
const (
	FreeShippingFrom = 6_000
	FlatShipping     = 490
	Currency         = "eur"
)

// ShippingFor is what an order with this subtotal pays for shipping.
func ShippingFor(subtotal int64) int64 {
	if subtotal >= FreeShippingFrom {
		return 0
	}
	return FlatShipping
}
