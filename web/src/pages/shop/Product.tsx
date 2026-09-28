import { useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { BackToShop } from "@/components/common/BackToShop";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Search } from "@/components/icons";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PageShell } from "@/components/layout/PageShell";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useCollectionInfo, useProduct } from "@/features/catalog/api";
import { AddToBag } from "@/features/catalog/components/AddToBag";
import { ProductGallery } from "@/features/catalog/components/ProductGallery";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import { ProductSpecs } from "@/features/catalog/components/ProductSpecs";
import { SizePicker } from "@/features/catalog/components/SizePicker";
import { defaultSize } from "@/features/catalog/variants";
import type { Product as ProductData } from "@/features/catalog/types";
import { sizePrice } from "@/features/catalog/pricing";
import { formatPrice } from "@/lib/format";

export function Product() {
  const { slug } = useParams();
  const query = useProduct(slug);

  return (
    <PageShell className="max-w-7xl">
      <QueryView
        query={query}
        notFound={
          <EmptyState
            icon={Search}
            title="Not found"
            description="That tee is not in the shop."
            action={<BackToShop />}
          />
        }
      >
        {/* Keyed so size and quantity reset when moving between products. */}
        {(product) => <ProductView key={product.slug} product={product} />}
      </QueryView>
    </PageShell>
  );
}

function ProductView({ product }: { product: ProductData & { related: ProductData[] } }) {
  const collection = useCollectionInfo(product.collection);
  const visualRef = useRef<HTMLDivElement>(null);
  const [pickedSize, setPickedSize] = useState<string>();
  const size = pickedSize ?? defaultSize(product.variants);

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductGallery product={product} mainRef={visualRef} />
        </div>
        <div className="flex flex-col">
          <Breadcrumb
            items={[
              { label: "Shop", to: "/#shop" },
              collection
                ? { label: collection.name, to: `/collections/${collection.slug}` }
                : { label: "Shop" },
              { label: product.name },
            ]}
          />
          <Eyebrow wide className="mt-8">
            {collection?.name ?? "Tee"}
          </Eyebrow>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight md:text-5xl">{product.name}</h1>
          <p className="mt-3 text-lg tabular-nums">{formatPrice(sizePrice(product, size), product.currency)}</p>
          <p className="mt-6 max-w-md leading-relaxed text-muted-foreground">{product.description}</p>
          <div className="mt-10">
            <ProductSpecs product={product} />
          </div>
          <div className="mt-8">
            <SizePicker variants={product.variants} value={size} onChange={setPickedSize} />
          </div>
          <AddToBag product={product} size={size} flyFrom={visualRef} />
        </div>
      </div>
      {product.related.length > 0 ? (
        <section className="mt-24 border-t pt-16">
          <h2 className="font-serif text-3xl font-medium tracking-tight">More tees</h2>
          <div className="mt-10">
            <ProductGrid products={product.related} />
          </div>
        </section>
      ) : null}
    </>
  );
}
