import type { Variant } from "./types";

/** Default to M (the second size) when in stock, else the first size in stock. */
export function defaultSize(variants: Variant[]) {
  const inStock = variants.filter((variant) => variant.stock > 0);
  return (inStock.find((variant) => variant.size === variants[1]?.size) ?? inStock[0])?.size;
}
