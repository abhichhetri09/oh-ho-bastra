import type { Swatch } from "@/data/products";

export type Collection = {
  slug: string;
  name: string;
  description: string;
  blurb: string;
  swatch: Swatch;
};

export const collections: Collection[] = [
  {
    slug: "tees",
    name: "Tees",
    description: "Plain cotton, a few colors.",
    blurb: "Heavyweight and boxy cuts. No print — just the tee.",
    swatch: {
      from: "#2a2a2a",
      to: "#111111",
      sheen: "rgba(180, 180, 180, 0.18)",
      fold: "#0a0a0a",
    },
  },
  {
    slug: "custom",
    name: "Custom",
    description: "Your print or your words.",
    blurb: "Same tees, printed to order. Send art or a line of text after checkout.",
    swatch: {
      from: "#c4784a",
      to: "#5c2e1c",
      sheen: "rgba(245, 214, 176, 0.35)",
      fold: "#2a140c",
    },
  },
];

export function getCollection(slug: string) {
  return collections.find((collection) => collection.slug === slug);
}
