import { Link, useParams } from "react-router-dom";

import { Breadcrumb } from "@/components/Breadcrumb";
import { ClothPanel } from "@/components/ClothPanel";
import { EmptyState } from "@/components/EmptyState";
import { Search } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ProductGrid } from "@/components/ProductGrid";
import { Button } from "@/components/ui/button";
import { getCollection } from "@/data/collections";
import { getProductsByCollection } from "@/data/products";

export function Collection() {
  const { slug } = useParams();
  const collection = slug ? getCollection(slug) : undefined;
  const items = slug ? getProductsByCollection(slug) : [];

  if (!collection) {
    return (
      <PageShell>
        <EmptyState
          icon={Search}
          title="Collection not found"
          description="That collection is empty, or the name has moved."
          action={
            <Button variant="outline" asChild>
              <Link to="/">Back to shop</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <div>
      <ClothPanel
        swatch={collection.swatch}
        label={collection.name}
        className="h-48 md:h-64"
      />
      <PageShell>
        <section className="space-y-10">
          <Breadcrumb
            items={[{ label: "Shop", to: "/#shop" }, { label: collection.name }]}
          />
          <PageHeader
            kicker="Collection"
            title={collection.name}
            description={collection.blurb}
          />
          {items.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing here yet"
              description="Tees for this collection will land soon."
            />
          ) : (
            <ProductGrid products={items} className="lg:grid-cols-2" />
          )}
        </section>
      </PageShell>
    </div>
  );
}
