export type Swatch = {
  from: string;
  to: string;
  sheen: string;
  fold: string;
};

export type Variant = {
  size: string;
  sku: string;
  stock: number;
  /** What this size costs (its own price, or the product's base price). */
  priceCents: number;
};

export type ProductPhoto = { url: string; alt: string };

export type Product = {
  slug: string;
  name: string;
  description: string;
  collection: string;
  color: string;
  fabric: string;
  fit: string;
  weight: string;
  care: string;
  priceCents: number;
  currency: string;
  swatch: Swatch | null;
  /** In display order; the first is the cover. */
  images: ProductPhoto[];
  variants: Variant[];
};

export const coverImage = (product: Pick<Product, "images" | "name">) =>
  product.images[0] ?? null;

export type Collection = {
  slug: string;
  name: string;
  description: string;
  blurb: string;
  swatch: Swatch | null;
  imageUrl: string | null;
};

// Neutral cloth shown while catalog data loads, or when a product has none.
export const placeholderSwatch: Swatch = {
  from: "#2a2a2a",
  to: "#111111",
  sheen: "rgba(180, 180, 180, 0.18)",
  fold: "#0a0a0a",
};
