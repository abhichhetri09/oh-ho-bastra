export type Swatch = {
  from: string;
  to: string;
  sheen: string;
  fold: string;
};

export const teeSizes = ["S", "M", "L", "XL"] as const;

export type Product = {
  slug: string;
  name: string;
  price: string;
  amount: number;
  description: string;
  collection: string;
  color: string;
  fabric: string;
  fit: string;
  weight: string;
  care: string;
  sizes: readonly string[];
  swatch: Swatch;
};

export const products: Product[] = [
  {
    slug: "heavyweight-black",
    name: "Heavyweight Tee — Black",
    price: "Rs 1,200",
    amount: 1200,
    collection: "tees",
    color: "Black",
    fabric: "100% cotton jersey",
    fit: "Regular",
    weight: "220 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "A thick black tee with a clean neck and a bit of weight. Everyday, no print.",
    swatch: {
      from: "#2a2a2a",
      to: "#111111",
      sheen: "rgba(180, 180, 180, 0.18)",
      fold: "#0a0a0a",
    },
  },
  {
    slug: "heavyweight-white",
    name: "Heavyweight Tee — White",
    price: "Rs 1,200",
    amount: 1200,
    collection: "tees",
    color: "White",
    fabric: "100% cotton jersey",
    fit: "Regular",
    weight: "220 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "The same heavyweight cut in undyed white. Soft after a wash, holds its shape.",
    swatch: {
      from: "#f4f1ea",
      to: "#ddd6c8",
      sheen: "rgba(255, 255, 255, 0.55)",
      fold: "#c4bbaa",
    },
  },
  {
    slug: "heavyweight-sand",
    name: "Heavyweight Tee — Sand",
    price: "Rs 1,200",
    amount: 1200,
    collection: "tees",
    color: "Sand",
    fabric: "100% cotton jersey",
    fit: "Regular",
    weight: "220 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "A warm sand tee. Same 220 gsm cotton, same regular fit.",
    swatch: {
      from: "#e6d5b8",
      to: "#c4a882",
      sheen: "rgba(255, 252, 245, 0.5)",
      fold: "#9a7b55",
    },
  },
  {
    slug: "boxy-navy",
    name: "Boxy Tee — Navy",
    price: "Rs 1,350",
    amount: 1350,
    collection: "tees",
    color: "Navy",
    fabric: "100% cotton jersey",
    fit: "Boxy",
    weight: "200 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "A shorter, wider navy tee. Sits off the body without looking oversized.",
    swatch: {
      from: "#24365c",
      to: "#12182a",
      sheen: "rgba(186, 206, 232, 0.28)",
      fold: "#0b0e18",
    },
  },
  {
    slug: "custom-print",
    name: "Custom Print Tee",
    price: "Rs 1,800",
    amount: 1800,
    collection: "custom",
    color: "Black",
    fabric: "100% cotton jersey",
    fit: "Regular",
    weight: "220 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "Your art on our heavyweight black tee. Send the file after you order — one color or full print.",
    swatch: {
      from: "#3a2a28",
      to: "#1a1211",
      sheen: "rgba(232, 196, 148, 0.22)",
      fold: "#0e0a09",
    },
  },
  {
    slug: "custom-text",
    name: "Custom Text Tee",
    price: "Rs 1,650",
    amount: 1650,
    collection: "custom",
    color: "White",
    fabric: "100% cotton jersey",
    fit: "Regular",
    weight: "220 gsm",
    care: "Cold wash, inside out",
    sizes: teeSizes,
    description:
      "One line of type on a white heavyweight tee. Name, date, or a short mark. Tell us the words after you order.",
    swatch: {
      from: "#f7f4ee",
      to: "#d9d0c2",
      sheen: "rgba(255, 255, 255, 0.45)",
      fold: "#b7ae9f",
    },
  },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function getProductsByCollection(collection: string) {
  return products.filter((product) => product.collection === collection);
}

export function getRelatedProducts(slug: string, limit = 3) {
  const current = getProduct(slug);
  const others = products.filter((product) => product.slug !== slug);
  if (!current) {
    return others.slice(0, limit);
  }
  return [
    ...others.filter((product) => product.collection === current.collection),
    ...others.filter((product) => product.collection !== current.collection),
  ].slice(0, limit);
}

export function formatRupees(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN")}`;
}
