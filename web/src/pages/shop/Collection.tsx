import { useParams } from "react-router-dom";

import { BackToShop } from "@/components/common/BackToShop";
import { ProductImage } from "@/components/common/ProductImage";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Search } from "@/components/icons";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { useCollection } from "@/features/catalog/api";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";

export function Collection() {
  const { slug } = useParams();
  const query = useCollection(slug);

  return (
    <QueryView
      query={query}
      notFound={
        <PageShell>
          <EmptyState
            icon={Search}
            title="Collection not found"
            description="That collection is empty, or the name has moved."
            action={<BackToShop />}
          />
        </PageShell>
      }
    >
      {(collection) => (
        <div>
          <ProductImage src={collection.imageUrl} alt={collection.name} swatch={collection.swatch} eager className="h-48 md:h-72" />
          <PageShell>
            <section className="space-y-10">
              <Breadcrumb items={[{ label: "Shop", to: "/#shop" }, { label: collection.name }]} />
              <PageHeader kicker="Collection" title={collection.name} description={collection.blurb} />
              {collection.products.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nothing here yet"
                  description="Tees for this collection will land soon."
                />
              ) : (
                <ProductGrid products={collection.products} className="lg:grid-cols-2" />
              )}
            </section>
          </PageShell>
        </div>
      )}
    </QueryView>
  );
}
