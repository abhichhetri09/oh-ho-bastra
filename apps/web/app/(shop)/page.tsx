import type { Metadata } from "next";
import { Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/components/seo/json-ld";
import { site } from "@/lib/site";
import { storeLd } from "@/lib/seo/structured-data";
import { siteUrl } from "@/lib/site-url";
import { getCollections, getListing } from "@/modules/catalog/api";
import { ProductGrid } from "@/modules/catalog/components/product-grid";
import { DEFAULT_FILTERS } from "@/modules/catalog/lib/filters";
import { CategoryTiles } from "@/modules/home/components/category-tiles";
import { Hero } from "@/modules/home/components/hero";
import { SectionHeading } from "@/modules/home/components/section-heading";

export const metadata: Metadata = {
  title: { absolute: site.homeTitle },
  alternates: { canonical: "/" },
};

/** How many editor's picks the landing page shows: one row on desktop. */
const PICKS = 4;

export default async function LandingPage() {
  const [featured, newest, collections] = await Promise.all([
    getListing(null, { ...DEFAULT_FILTERS, featured: true }),
    getListing(null, DEFAULT_FILTERS),
    getCollections(),
  ]);
  // Topped up with the newest tees while fewer than four are featured.
  const picks = [
    ...new Map(
      [
        ...(featured?.data.products ?? []),
        ...(newest?.data.products ?? []),
      ].map((product) => [product.id, product] as const),
    ).values(),
  ].slice(0, PICKS);

  return (
    <div className="space-y-16 sm:space-y-24">
      <JsonLd data={storeLd(siteUrl())} />
      <Hero />

      {collections.length > 0 && (
        <section className="container-page" aria-label="Shop by category">
          <CategoryTiles collections={collections} />
        </section>
      )}

      {picks.length > 0 && (
        <section className="container-page">
          <SectionHeading title={site.picks.title} href={site.picks.href} />
          <Reveal delay={0.1}>
            <ProductGrid
              products={picks}
              eagerCount={0}
              className="md:grid-cols-4"
            />
          </Reveal>
        </section>
      )}
    </div>
  );
}
