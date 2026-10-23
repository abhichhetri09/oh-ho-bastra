import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useCollectionInfo } from "@/features/catalog/api";
import { formatPriceRange } from "@/features/catalog/pricing";
import type { Product } from "@/features/catalog/types";

export function ProductCard({ product }: { product: Product }) {
  const collection = useCollectionInfo(product.collection);
  const [cover, second] = product.images;

  return (
    <Link to={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-4/5 overflow-hidden rounded-lg">
        <ProductImage
          src={cover?.url}
          alt={cover?.alt || product.name}
          swatch={product.swatch}
          className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {/* The second photo fades in on hover, like most shops. */}
        {second ? (
          <ProductImage
            src={second.url}
            alt=""
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        ) : null}
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          {collection ? <Eyebrow>{collection.name}</Eyebrow> : null}
          <h3 className="mt-1 font-serif text-xl font-medium tracking-tight text-foreground md:text-2xl">
            {product.name}
          </h3>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatPriceRange(product)}</p>
      </div>
    </Link>
  );
}
