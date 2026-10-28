// What shipping costs (internal/constants/shipping.go). Amounts are cents.
// The web shows the same rule from apps/web/lib/shipping.ts: change both
// together.

/** Orders from this subtotal ship free. */
export const FREE_SHIPPING_FROM = 6_000;
/** Shipping below FREE_SHIPPING_FROM. */
export const FLAT_SHIPPING = 490;
/** The store's currency (Stripe's lowercase code). */
export const CURRENCY = "eur";

/**
 * What an order with this subtotal pays for shipping. Pass the subtotal
 * after any discount code: free shipping counts what the items cost.
 */
export const shippingFor = (subtotal: number) =>
  subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
