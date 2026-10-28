// Display copy of the shipping rule (apps/api/src/checkout/shipping.ts):
// the API decides what an order is charged, and the cart answers with its
// shipping and total. This copy prices optimistic bag updates and the
// free-shipping bar; keep the two in step.
export const FREE_SHIPPING_FROM = 6_000;
export const FLAT_SHIPPING = 490;

/**
 * Shipping for a subtotal in cents, after any discount code: the free
 * threshold counts what is paid for the items.
 */
export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
}
