import type { ProductWithPrice } from "@repo/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

export const GRID_CLASSES =
  "grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 md:gap-y-14 xl:grid-cols-4";

/** A static grid; the first row loads eagerly (it is above the fold). */
export function ProductGrid({
  products,
  eagerCount = 4,
  className,
}: {
  products: ProductWithPrice[];
  eagerCount?: number;
  className?: string;
}) {
  return (
    <div className={cn(GRID_CLASSES, className)}>
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          index={i}
          eager={i < eagerCount}
        />
      ))}
    </div>
  );
}
