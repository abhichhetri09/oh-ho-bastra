import type { Metadata } from "next";
import { ListingPage } from "@/modules/catalog/components/listing-page";
import { ShopHeader } from "@/modules/catalog/components/shop-header";
import { getCollections } from "@/modules/catalog/api";
import {
  parseFilters,
  shopTitle,
  type SearchParams,
} from "@/modules/catalog/lib/filters";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const title = shopTitle(filters.q, filters.featured);
  if (filters.q) {
    // Result pages are endless and thin; keep them out of the index.
    return { title, robots: { index: false } };
  }
  return {
    title,
    // Filters and sorts fold into the plain listing (or the picks).
    alternates: {
      canonical: filters.featured ? "/shop?featured=true" : "/shop",
    },
    description: filters.featured
      ? "The pieces we reach for most."
      : "Every tee in the Oh Ho Bastra collection.",
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [query, collections] = await Promise.all([
    searchParams,
    getCollections(),
  ]);

  return (
    <div className="container-page">
      <ShopHeader
        links={collections.map((c) => ({
          label: c.name,
          href: `/categories/${c.slug}`,
        }))}
      />
      <ListingPage category={null} searchParams={query} />
    </div>
  );
}
