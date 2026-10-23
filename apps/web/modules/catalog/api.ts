import "server-only";
import { cache } from "react";
import {
  getProductBySlug,
  listCategories,
  listCategoryProducts,
  listProducts,
} from "@repo/api-client/server";
import { publicClient } from "@/lib/api/public";
import { buildCategoryTree, childCategories } from "./lib/category-tree";
import {
  DEFAULT_FILTERS,
  listingQuery,
  type ListingFilters,
} from "./lib/filters";

// Server-side catalog reads, cached by Next for `revalidate` seconds. A 404
// from the API (unknown slug, page past the end) comes back as null so the
// page can call notFound(); anything else is thrown to the error boundary.

const CATEGORIES_TTL = 300;
const LISTING_TTL = 60;
const PRODUCT_TTL = 60;

function check(
  response: Response | undefined,
  what: string,
): asserts response is Response {
  if (!response) throw new Error(`${what}: API unreachable`);
}

function notFoundOrThrow(response: Response, what: string): null {
  // 400 here means a page past the end or a filter the URL parser let
  // through; treat it like a missing page rather than an error.
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`${what}: API responded ${response.status}`);
}

/** Every category; the header and pages share it within a request. */
export const getCategories = cache(async () => {
  const { data, response } = await listCategories({
    client: publicClient(CATEGORIES_TTL),
  });
  check(response, "list categories");
  if (!data)
    throw new Error(`list categories: API responded ${response.status}`);
  return data.data;
});

/** One page of a listing: every product, or a category's subtree. */
export async function getListing(
  category: string | null,
  filters: ListingFilters,
  page = 1,
) {
  const client = publicClient(LISTING_TTL);
  const query = listingQuery(filters, page);
  const { data, response } = category
    ? await listCategoryProducts({ client, path: { slug: category }, query })
    : await listProducts({ client, query });
  check(response, "list products");
  return data ?? notFoundOrThrow(response, "list products");
}

/** Cached per request: generateMetadata and the page both need it. */
export const getProductPage = cache(async (slug: string) => {
  const { data, response } = await getProductBySlug({
    client: publicClient(PRODUCT_TTL),
    path: { productSlug: slug },
  });
  check(response, "get product");
  return data?.data ?? notFoundOrThrow(response, "get product");
});

/** How many visible products a category's subtree holds (0 if unknown). */
const productCount = cache(async (slug: string): Promise<number> => {
  const listing = await getListing(slug, DEFAULT_FILTERS);
  return listing?.meta.total ?? 0;
});

/**
 * The direct children of the category with slug that have products, so
 * shoppers are never sent to an empty page from the menu or the chips.
 * `keep` stays even when empty (the page the shopper is on).
 */
export async function stockedChildren(
  categories: Awaited<ReturnType<typeof getCategories>>,
  slug: string,
  keep?: string,
) {
  const children = childCategories(categories, slug);
  const counts = await Promise.all(children.map((c) => productCount(c.slug)));
  return children.filter((c, i) => counts[i]! > 0 || c.slug === keep);
}

/** A root category with its children, product count and a cover photo. */
export type Collection = {
  name: string;
  slug: string;
  children: { name: string; slug: string }[];
  total: number;
  image: string | null;
  imageCaption: string | null;
};

/**
 * Root categories that have products (a category with none, or whose
 * products are all hidden, stays out of the menu), largest first, each
 * with its stocked subcategories and its newest product's photo as a
 * cover. Shared by the header menu and the landing page.
 */
export const getCollections = cache(async (): Promise<Collection[]> => {
  const categories = await getCategories();
  const tree = buildCategoryTree(categories);
  const collections = await Promise.all(
    tree.map(async (root): Promise<Collection | null> => {
      const listing = await getListing(root.slug, DEFAULT_FILTERS);
      if (!listing || listing.meta.total === 0) return null;
      const product = listing.data.products[0];
      const children = await stockedChildren(categories, root.slug);
      return {
        name: root.name,
        slug: root.slug,
        children: children.map(({ name, slug }) => ({ name, slug })),
        total: listing.meta.total,
        image: product?.images[0] ?? null,
        imageCaption: product?.name ?? null,
      };
    }),
  );
  // Biggest collections first: they lead the menu and the landing grid.
  return collections
    .filter((c) => c !== null)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
});
