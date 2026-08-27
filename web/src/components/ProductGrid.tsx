import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/data/products";
import { cn } from "@/lib/utils";

export function ProductGrid({
  products,
  className,
}: {
  products: Product[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.slug} product={product} />
      ))}
    </div>
  );
}
