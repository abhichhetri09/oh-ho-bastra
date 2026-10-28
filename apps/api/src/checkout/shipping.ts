import type { ShippingRule } from "@repo/types";
import { getShippingRule } from "../db/gen";
import type { Queryable } from "../db/queryable";

// What shipping costs. Amounts are cents. The rule lives in store_settings
// (Admin → Business, PUT /admin/settings/shipping), read where it's used so
// a change prices the next bag and checkout; an order keeps what it was
// charged (orders.shipping). The web prices optimistic bag updates with
// the same rule from GET /settings (apps/web/lib/shipping.ts).

/** The store's currency (Stripe's lowercase code). */
export const CURRENCY = "eur";

export type { ShippingRule };

/**
 * What an order with this subtotal pays for shipping under rule. Pass the
 * subtotal after any discount code: free shipping counts what the items
 * cost. A rule without a threshold never ships free.
 */
export const shippingFor = (subtotal: number, rule: ShippingRule) =>
  rule.free_from !== null && subtotal >= rule.free_from ? 0 : rule.flat;

/** The rule as store_settings holds it. */
export const shippingRuleOf = (row: {
  shipping_flat: number;
  free_shipping_from: number | null;
}): ShippingRule => ({
  flat: row.shipping_flat,
  free_from: row.free_shipping_from,
});

/**
 * The rule as of now. Checkout reads it in its transaction, so the order
 * is charged the rule it was placed under. The settings row is seeded by
 * its migration; without it there's nothing safe to charge.
 */
export async function loadShippingRule(db: Queryable): Promise<ShippingRule> {
  const row = await getShippingRule(db);
  if (!row) throw new Error("get shipping rule: no rows in result set");
  return shippingRuleOf(row);
}
