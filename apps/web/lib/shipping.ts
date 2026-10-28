import type { ShippingRule } from "@repo/types";
import { formatPrice, formatPriceShort } from "./money";

// The store's shipping rule, as an admin sets it (Admin → Business) and
// GET /settings sends it. The API decides what an order is charged (and
// the cart answers with its shipping and total); the web uses the same rule
// to price optimistic bag updates, draw the free-shipping bar and word the
// store's copy. Amounts are cents.

/**
 * The rule the store starts with (store_settings' defaults), for pages that
 * render while the API can't answer.
 */
export const DEFAULT_SHIPPING: ShippingRule = { flat: 490, free_from: 6_000 };

/**
 * Shipping for a subtotal in cents under rule, after any discount code:
 * the free threshold counts what is paid for the items. A rule without a
 * threshold never ships free.
 */
export function shippingFor(subtotal: number, rule: ShippingRule): number {
  return rule.free_from !== null && subtotal >= rule.free_from ? 0 : rule.flat;
}

/**
 * The threshold the free-shipping bar counts towards, or null when there's
 * nothing to count: shipping is never free, or always is.
 */
export function freeShippingFrom(rule: ShippingRule): number | null {
  return rule.flat > 0 ? rule.free_from : null;
}

/**
 * How far a subtotal (after any discount code) is from free shipping:
 * what's left to add and the share already there. Null when the bar has
 * nothing to show (see freeShippingFrom).
 */
export function freeShippingProgress(
  subtotal: number,
  rule: ShippingRule,
): { remaining: number; share: number } | null {
  const from = freeShippingFrom(rule);
  if (from === null) return null;
  return {
    remaining: Math.max(from - subtotal, 0),
    share: Math.min(Math.max(subtotal, 0) / from, 1),
  };
}

/**
 * The rule as a short perk: "Free shipping over €60", or the flat price
 * when shipping is never free.
 */
export function shippingPerk(rule: ShippingRule): string {
  if (rule.flat === 0) return "Free shipping on every order";
  if (rule.free_from === null)
    return `Flat ${formatPriceShort(rule.flat)} shipping`;
  return `Free shipping over ${formatPriceShort(rule.free_from)}`;
}

/**
 * The rule as a sentence for the shop's copy: "Standard shipping is free
 * on orders over €60; otherwise it is a flat €4.90."
 */
export function shippingSentence(rule: ShippingRule): string {
  const flat = formatPriceShort(rule.flat);
  if (rule.flat === 0) return "Standard shipping is free on every order.";
  if (rule.free_from === null) return `Standard shipping is a flat ${flat}.`;
  return `Standard shipping is free on orders over ${formatPriceShort(rule.free_from)}; otherwise it is a flat ${flat}.`;
}

/**
 * The rule as the admin's one-line example: "Orders under €60.00 pay
 * €4.90; €60.00 and over ship free."
 */
export function shippingExample(rule: ShippingRule): string {
  if (rule.flat === 0) return "Every order ships free.";
  const flat = formatPrice(rule.flat);
  if (rule.free_from === null) return `Every order pays ${flat} for delivery.`;
  const from = formatPrice(rule.free_from);
  return `Orders under ${from} pay ${flat}; ${from} and over ship free.`;
}
