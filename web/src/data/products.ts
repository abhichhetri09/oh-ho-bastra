export type Product = {
  slug: string;
  name: string;
  price: string;
  description: string;
};

export const products: Product[] = [
  {
    slug: "silk-saree",
    name: "Silk Saree",
    price: "Rs 4,800",
    description: "Handwoven silk with a muted border. Drapes light, wears easy.",
  },
  {
    slug: "cotton-kurta",
    name: "Cotton Kurta",
    price: "Rs 2,200",
    description: "Everyday cotton, relaxed cut. Soft from the first wash.",
  },
  {
    slug: "linen-shawl",
    name: "Linen Shawl",
    price: "Rs 1,650",
    description: "A light wrap for cool evenings. Natural linen, undyed.",
  },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
