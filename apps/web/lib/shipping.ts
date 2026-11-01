import type { ShippingRule } from "@repo/types";
import { formatPrice, formatPriceShort } from "./money";

// The store's shipping rule, as an admin sets it (Admin → Settings →
// Delivery) and GET /settings sends it. The API decides what an order is
// charged (and the cart answers with its shipping and total); the web uses
// the same rule to price optimistic bag updates, draw the free-shipping bar
// and word the store's copy. Amounts are cents.

/**
 * The rule the store starts with (store_settings' defaults), for pages that
 * render while the API can't answer.
 */
export const DEFAULT_SHIPPING: ShippingRule = {
  flat: 490,
  free_from: 6_000,
  free_items: null,
};

/** "3 items", "1 item". */
export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/**
 * Shipping for a subtotal in cents (after any discount code) and an item
 * count under rule: free from either threshold, the flat price otherwise.
 * A rule without a threshold never ships free.
 */
export function shippingFor(
  subtotal: number,
  items: number,
  rule: ShippingRule,
): number {
  return (rule.free_from !== null && subtotal >= rule.free_from) ||
    (rule.free_items !== null && items >= rule.free_items)
    ? 0
    : rule.flat;
}

/** Whether the rule ever ships free below a paid order (a bar to show). */
export function hasFreeShipping(rule: ShippingRule): boolean {
  return rule.flat > 0 && (rule.free_from !== null || rule.free_items !== null);
}

/**
 * How far a bag is from free shipping: what's left to spend and how many
 * items are left to add (null for a rule the store doesn't use), and the
 * share already there (the nearer of the two). Null when there's nothing
 * to show: shipping is never free, or always is.
 */
export function freeShippingProgress(
  subtotal: number,
  items: number,
  rule: ShippingRule,
): {
  free: boolean;
  remaining: number | null;
  itemsLeft: number | null;
  share: number;
} | null {
  if (!hasFreeShipping(rule)) return null;
  const remaining =
    rule.free_from === null ? null : Math.max(rule.free_from - subtotal, 0);
  const itemsLeft =
    rule.free_items === null ? null : Math.max(rule.free_items - items, 0);
  const share = Math.min(
    Math.max(
      rule.free_from === null ? 0 : Math.max(subtotal, 0) / rule.free_from,
      rule.free_items === null ? 0 : items / rule.free_items,
    ),
    1,
  );
  return {
    free: remaining === 0 || itemsLeft === 0,
    remaining,
    itemsLeft,
    share,
  };
}

/** The free thresholds in words: "over €70 or on 3+ items". */
function freeWhen(rule: ShippingRule, price: (cents: number) => string) {
  const parts = [
    rule.free_from !== null && `over ${price(rule.free_from)}`,
    rule.free_items !== null && `on ${rule.free_items}+ items`,
  ].filter(Boolean);
  return parts.join(" or ");
}

/**
 * The rule as a short perk: "Free shipping over €70 or on 3+ items", or
 * the flat price when shipping is never free.
 */
export function shippingPerk(rule: ShippingRule): string {
  if (rule.flat === 0) return "Free shipping on every order";
  if (!hasFreeShipping(rule))
    return `Flat ${formatPriceShort(rule.flat)} shipping`;
  return `Free shipping ${freeWhen(rule, formatPriceShort)}`;
}

/**
 * The rule as a sentence for the shop's copy: "Standard shipping is free
 * on orders over €70 or of 3 or more items; otherwise it is a flat €6."
 */
export function shippingSentence(rule: ShippingRule): string {
  const flat = formatPriceShort(rule.flat);
  if (rule.flat === 0) return "Standard shipping is free on every order.";
  if (!hasFreeShipping(rule)) return `Standard shipping is a flat ${flat}.`;
  const when = [
    rule.free_from !== null && `over ${formatPriceShort(rule.free_from)}`,
    rule.free_items !== null && `of ${rule.free_items} or more items`,
  ]
    .filter(Boolean)
    .join(" or ");
  return `Standard shipping is free on orders ${when}; otherwise it is a flat ${flat}.`;
}

/**
 * The rule as the admin's one-line example: "Orders under €70.00 and of
 * fewer than 3 items pay €6.00; the rest ship free."
 */
export function shippingExample(rule: ShippingRule): string {
  if (rule.flat === 0) return "Every order ships free.";
  const flat = formatPrice(rule.flat);
  if (!hasFreeShipping(rule)) return `Every order pays ${flat} for delivery.`;
  if (rule.free_items === null && rule.free_from !== null) {
    const from = formatPrice(rule.free_from);
    return `Orders under ${from} pay ${flat}; ${from} and over ship free.`;
  }
  const below = [
    rule.free_from !== null && `under ${formatPrice(rule.free_from)}`,
    rule.free_items !== null && `of fewer than ${itemsLabel(rule.free_items)}`,
  ]
    .filter(Boolean)
    .join(" and ");
  return `Orders ${below} pay ${flat}; the rest ship free.`;
}
