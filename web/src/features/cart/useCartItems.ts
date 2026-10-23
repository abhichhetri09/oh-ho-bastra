import { useProducts } from "@/features/catalog/api";
import { sizePrice } from "@/features/catalog/pricing";
import type { Product } from "@/features/catalog/types";
import { useCart, type CartLine } from "./cart-context";

export type CartItem = CartLine & { product: Product; unitPriceCents: number };

/** Cart lines joined with live catalog data; lines for removed products drop out. */
export function useCartItems() {
  const { lines } = useCart();
  const { data: products, isPending } = useProducts();

  const items: CartItem[] = lines.flatMap((line) => {
    const product = products?.find((item) => item.slug === line.slug);
    return product ? [{ ...line, product, unitPriceCents: sizePrice(product, line.size) }] : [];
  });
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  return { lines, items, subtotalCents, isPending: isPending && lines.length > 0 };
}
