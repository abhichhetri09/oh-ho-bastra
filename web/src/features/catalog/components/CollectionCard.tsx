import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import { ArrowRight } from "@/components/icons";
import type { Collection } from "@/features/catalog/types";

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link to={`/collections/${collection.slug}`} className="group block">
      <div className="overflow-hidden rounded-lg">
        <ProductImage
          src={collection.imageUrl}
          alt={collection.name}
          swatch={collection.swatch}
          className="aspect-4/5 transition-transform duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-4 flex items-center gap-2 font-serif text-2xl font-medium tracking-tight">
        {collection.name}
        <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{collection.description}</p>
    </Link>
  );
}
