import { useState } from "react";

import { centsToInput, parseEuros } from "@/features/admin/price-input";
import type { AdminProductDetail, ProductInput } from "@/features/admin/types";

export type SizeRow = { size: string; stock: string; price: string; existing: boolean };

export type PricingMode = "same" | "per-size";

export type ProductDraft = Omit<ProductInput, "priceCents" | "variants" | "swatch"> & {
  price: string;
  pricing: PricingMode;
  images: { url: string; alt: string }[];
  sizes: SizeRow[];
};

const blank: ProductDraft = {
  name: "",
  collection: "tees",
  description: "",
  color: "",
  fabric: "100% cotton jersey",
  fit: "Regular",
  weight: "220 gsm",
  care: "Cold wash, inside out",
  price: "",
  pricing: "same",
  active: true,
  images: [],
  sizes: ["S", "M", "L", "XL"].map((size) => ({ size, stock: "0", price: "", existing: false })),
};

function fromProduct(p: AdminProductDetail): ProductDraft {
  return {
    name: p.name,
    collection: p.collection,
    description: p.description,
    color: p.color,
    fabric: p.fabric,
    fit: p.fit,
    weight: p.weight,
    care: p.care,
    price: centsToInput(p.priceCents),
    pricing: p.variants.some((v) => v.priceCents !== null && v.priceCents !== p.priceCents) ? "per-size" : "same",
    active: p.active,
    images: p.images,
    sizes: p.variants.map((v) => ({
      size: v.size,
      stock: String(v.stock),
      price: centsToInput(v.priceCents ?? p.priceCents),
      existing: true,
    })),
  };
}

/** Form state for creating or editing a product, with validation and conversion to the API shape. */
export function useProductForm(initial?: AdminProductDetail) {
  const [draft, setDraft] = useState<ProductDraft>(() => (initial ? fromProduct(initial) : blank));
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const perSize = draft.pricing === "per-size";
  const sizePrices = draft.sizes.map((s) => parseEuros(s.price));
  // Per size: the base price is the cheapest size (shown as "from …" in the shop).
  const priceCents = perSize
    ? sizePrices.every((p) => p !== null) && sizePrices.length
      ? Math.min(...(sizePrices as number[]))
      : null
    : parseEuros(draft.price);
  const sizeKeys = draft.sizes.map((s) => s.size.trim().toUpperCase());
  const problems = [
    !perSize && priceCents === null && "Enter a price, like 29,00.",
    perSize && sizePrices.some((p) => p === null) && "Give every size a price, like 29,00.",
    draft.sizes.length === 0 && "Add at least one size.",
    sizeKeys.some((s) => !s) && "Every size needs a name.",
    new Set(sizeKeys).size !== sizeKeys.length && "Sizes must be unique.",
    draft.sizes.some((s) => !/^\d+$/.test(s.stock.trim())) && "Stock must be a whole number.",
  ].filter(Boolean) as string[];

  function toInput(): ProductInput {
    const { name, collection, description, color, fabric, fit, weight, care, active, images, sizes } = draft;
    const base = priceCents ?? 0;
    return {
      name,
      collection,
      description,
      color,
      fabric,
      fit,
      weight,
      care,
      active,
      priceCents: base,
      // Keep an existing product's swatch as the no-photo fallback.
      swatch: initial?.swatch ?? null,
      images: images.map((image) => ({ url: image.url, alt: image.alt.trim() })),
      variants: sizes.map((s, i) => {
        const own = sizePrices[i];
        return {
          size: s.size.trim().toUpperCase(),
          stock: Number(s.stock),
          // Only store an override when it differs from the base price.
          priceCents: perSize && own !== null && own !== base ? own : null,
        };
      }),
    };
  }

  return {
    draft,
    set,
    problems,
    toInput,
    updateSize: (index: number, patch: Partial<SizeRow>) =>
      set("sizes", draft.sizes.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    addSize: (size = "") =>
      set("sizes", [...draft.sizes, { size, stock: "0", price: draft.price, existing: false }]),
    /** Switching to per-size starts every size at the current single price. */
    setPricing: (mode: PricingMode) =>
      setDraft((d) => ({
        ...d,
        pricing: mode,
        sizes: mode === "per-size" ? d.sizes.map((s) => ({ ...s, price: s.price || d.price })) : d.sizes,
        price: mode === "same" && !d.price ? (d.sizes.find((s) => s.price)?.price ?? "") : d.price,
      })),
    removeSize: (index: number) => set("sizes", draft.sizes.filter((_, i) => i !== index)),
    addImages: (urls: string[]) =>
      setDraft((d) => ({ ...d, images: [...d.images, ...urls.map((url) => ({ url, alt: "" }))] })),
    updateImage: (index: number, alt: string) =>
      set("images", draft.images.map((image, i) => (i === index ? { ...image, alt } : image))),
    removeImage: (index: number) => set("images", draft.images.filter((_, i) => i !== index)),
    /** Moves a photo one step left (-1) or right (+1); position 0 is the cover. */
    moveImage: (index: number, step: -1 | 1) => {
      const target = index + step;
      if (target < 0 || target >= draft.images.length) return;
      const next = [...draft.images];
      [next[index], next[target]] = [next[target], next[index]];
      set("images", next);
    },
  };
}
