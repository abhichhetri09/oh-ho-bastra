import { formatPrice } from "@/lib/format";
import type { Product } from "./types";

/** Price of one size; falls back to the base price for unknown sizes. */
export function sizePrice(product: Product, size: string | undefined) {
  return product.variants.find((v) => v.size === size)?.priceCents ?? product.priceCents;
}

export function priceRange(product: Product) {
  const prices = product.variants.length ? product.variants.map((v) => v.priceCents) : [product.priceCents];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** "29,00 €", or "from 29,00 €" when sizes are priced differently. */
export function formatPriceRange(product: Product) {
  const { min, max } = priceRange(product);
  return min === max ? formatPrice(min, product.currency) : `from ${formatPrice(min, product.currency)}`;
}
