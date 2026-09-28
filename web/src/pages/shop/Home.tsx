import { PageHeader } from "@/components/layout/PageHeader";
import { Loading } from "@/components/feedback/QueryView";
import { useCollections, useProducts } from "@/features/catalog/api";
import { CollectionCard } from "@/features/catalog/components/CollectionCard";
import { CustomPromo } from "@/features/catalog/components/home/CustomPromo";
import { Hero } from "@/features/catalog/components/home/Hero";
import { HomeSection } from "@/features/catalog/components/home/HomeSection";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";

export function Home() {
  const { data: collections = [] } = useCollections();
  const { data: products = [], isPending, isError } = useProducts();
  const custom = collections.find((collection) => collection.slug === "custom");

  return (
    <div>
      <Hero product={products[0]} />

      <HomeSection id="collections">
        <PageHeader kicker="Shop" title="Collections" description="Plain tees off the shelf, long sleeves for the cold months, or we print yours." />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard key={collection.slug} collection={collection} />
          ))}
        </div>
      </HomeSection>

      <HomeSection id="shop">
        <PageHeader kicker="The shop" title="In stock" description="Heavyweight cotton in a handful of colours, plus the ones we print for you." />
        <div className="mt-12">
          {isPending ? (
            <Loading />
          ) : isError ? (
            <p className="text-muted-foreground">Could not load the shop. Try again in a moment.</p>
          ) : (
            <ProductGrid products={products} />
          )}
        </div>
      </HomeSection>

      <CustomPromo collection={custom} />
    </div>
  );
}
