// What shipping costs (internal/constants/shipping.go). Amounts are cents.

/** Orders from this subtotal ship free. */
export const FREE_SHIPPING_FROM = 6_000;
/** Shipping below FREE_SHIPPING_FROM. */
export const FLAT_SHIPPING = 490;
/** The store's currency (Stripe's lowercase code). */
export const CURRENCY = "eur";

/** What an order with this subtotal pays for shipping. */
export const shippingFor = (subtotal: number) =>
  subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
