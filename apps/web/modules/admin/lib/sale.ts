import type { SaleResult, SaleTarget } from "@repo/types";
import { formatPrice } from "@/lib/money";

/** What a sale applies to, as the dialog's scope radio picks it. */
export type SaleScope = "selected" | "category" | "all";

/** The most percent_off the API takes (it keeps a sale from giving stock away). */
export const MAX_PERCENT_OFF = 90;

/**
 * A price with percent off, as the API rounds it (half up, to the cent);
 * null when the API would skip the variant: the offer would be 0 or the
 * full price.
 */
export function salePrice(cents: number, percent: number): number | null {
  const offer = Math.round((cents * (100 - percent)) / 100);
  return offer > 0 && offer < cents ? offer : null;
}

/** "20" → 20; null for anything but a whole number from 1 to 90. */
export function parsePercent(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= 1 && n <= MAX_PERCENT_OFF ? n : null;
}

/** "20% off — €25.00 → €20.00", for the dialog's preview line. */
export function salePreview(percent: number, cents: number): string {
  const offer = salePrice(cents, percent);
  return offer === null
    ? `${percent}% off — ${formatPrice(cents)} is too low to discount`
    : `${percent}% off — ${formatPrice(cents)} → ${formatPrice(offer)}`;
}

/** The request's target for a scope; null while it is incomplete. */
export function saleTarget(
  scope: SaleScope,
  {
    productIds,
    categoryId,
    includeSubcategories,
  }: {
    productIds: readonly string[];
    categoryId: string;
    includeSubcategories: boolean;
  },
): SaleTarget | null {
  switch (scope) {
    case "selected":
      return productIds.length ? { product_ids: [...productIds] } : null;
    case "category":
      return categoryId
        ? {
            category_id: categoryId,
            include_subcategories: includeSubcategories,
          }
        : null;
    case "all":
      return { all: true };
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The success toast: what the sale (or its end) changed. */
export function saleSummary(result: SaleResult, ended: boolean): string {
  if (result.variants === 0) {
    return ended
      ? "Nothing was on sale there."
      : "No variants could be discounted.";
  }
  const counts = `${plural(result.products, "product", "products")} (${plural(result.variants, "variant", "variants")})`;
  return ended ? `Sale ended on ${counts}` : `${counts} put on sale`;
}
