import "server-only";
import { cache } from "react";
import {
  getProductBySlug,
  listCategories,
  listCategoryProducts,
  listProducts,
} from "@repo/api-client/server";
import { publicClient } from "@/lib/api/public";
import { buildCategoryTree } from "./lib/category-tree";
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
 * Root categories that have products, largest first, each with its newest
 * product's photo as a cover. Shared by the header menu and the landing page.
 */
export const getCollections = cache(async (): Promise<Collection[]> => {
  const tree = buildCategoryTree(await getCategories());
  const collections = await Promise.all(
    tree.map(async (root): Promise<Collection | null> => {
      const listing = await getListing(root.slug, DEFAULT_FILTERS);
      if (!listing || listing.meta.total === 0) return null;
      const product = listing.data.products[0];
      return {
        name: root.name,
        slug: root.slug,
        children: root.children.map(({ name, slug }) => ({ name, slug })),
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
