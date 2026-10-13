import type { MetadataRoute } from "next";
import { connection } from "next/server";
import type { CategoryNode, ProductWithPrice } from "@repo/types";
import { siteUrl } from "@/lib/site-url";
import { getCategories, getListing } from "@/modules/catalog/api";
import { DEFAULT_FILTERS } from "@/modules/catalog/lib/filters";

/** Every visible product, page by page (24 a page; pages 2+ in parallel). */
async function allProducts(): Promise<ProductWithPrice[]> {
  const first = await getListing(null, DEFAULT_FILTERS, 1);
  if (!first) return [];
  const rest = await Promise.all(
    Array.from({ length: first.meta.total_pages - 1 }, (_, i) =>
      getListing(null, DEFAULT_FILTERS, i + 2),
    ),
  );
  // A product added between page reads shifts the pages; drop repeats.
  const products = [first, ...rest].flatMap(
    (page) => page?.data.products ?? [],
  );
  return [...new Map(products.map((p) => [p.id, p])).values()];
}

/** Categories with a visible product in them or below them. */
function stockedCategories(
  categories: CategoryNode[],
  products: ProductWithPrice[],
): CategoryNode[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const stocked = new Set<string>();
  for (const product of products) {
    let category = product.category_id
      ? byId.get(product.category_id)
      : undefined;
    while (category && !stocked.has(category.id)) {
      stocked.add(category.id);
      category = category.parent_id ? byId.get(category.parent_id) : undefined;
    }
  }
  return categories.filter((c) => stocked.has(c.id));
}

/**
 * The storefront's public pages. Built per request from the cached catalog
 * reads: prerendering it at build time would need the API there. An API
 * failure is a 500, which crawlers retry, rather than an empty sitemap.
 * At thousands of products, a slim API endpoint (slug + updated_at) would
 * beat paging the listing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = siteUrl();
  const [categories, products] = await Promise.all([
    getCategories(),
    allProducts(),
  ]);
  const newest = products.reduce<string | undefined>(
    (latest, p) => (!latest || p.updated_at > latest ? p.updated_at : latest),
    undefined,
  );

  return [
    { url: `${origin}/`, lastModified: newest, priority: 1 },
    { url: `${origin}/shop`, lastModified: newest, priority: 0.8 },
    ...stockedCategories(categories, products).map((c) => ({
      url: `${origin}/categories/${c.slug}`,
      lastModified: c.updated_at,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${origin}/products/${p.slug}`,
      lastModified: p.updated_at,
      priority: 0.6,
      images: p.images,
    })),
  ];
}
