// Display copy of the shipping rule. The API decides what an order is
// charged (from the checkout PR on); keep these in step with it.
export const FREE_SHIPPING_FROM = 6_000;
export const FLAT_SHIPPING = 490;

/** Shipping for a subtotal in cents. */
export function shippingFor(subtotal: number): number {
  return subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
}
