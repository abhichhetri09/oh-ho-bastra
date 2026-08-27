import { Link } from "react-router-dom";

import { ClothPanel } from "@/components/ClothPanel";
import { getCollection } from "@/data/collections";
import type { Product } from "@/data/products";

export function ProductCard({ product }: { product: Product }) {
  const collection = getCollection(product.collection);

  return (
    <Link to={`/products/${product.slug}`} className="group block">
      <div className="overflow-hidden">
        <ClothPanel
          swatch={product.swatch}
          label={product.name}
          className="aspect-3/4 transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          {collection ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {collection.name}
            </p>
          ) : null}
          <h3 className="mt-1 font-serif text-xl font-medium tracking-tight text-foreground md:text-2xl">
            {product.name}
          </h3>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {product.price}
        </p>
      </div>
    </Link>
  );
}
