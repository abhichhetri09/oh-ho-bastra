import type { CartItem } from "@/features/cart/useCartItems";
import { ApiError } from "@/lib/http";

/** Turns an order-creation failure into a message the buyer can act on. */
export function checkoutErrorMessage(error: Error | null, items: CartItem[]) {
  if (!error) {
    return null;
  }
  if (error instanceof ApiError && error.status === 409) {
    const sold = items.find(
      (item) => item.slug === error.body.slug && item.size === error.body.size,
    );
    return sold
      ? `${sold.product.name} in ${sold.size} just sold out, or there are not that many left. Update your bag and try again.`
      : error.message;
  }
  if (error instanceof ApiError && error.status === 400) {
    return "Check your details — something is missing or not valid.";
  }
  return "Could not place the order. Try again in a moment.";
}
