"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ProductListingResponse, StorefrontVariant } from "@repo/types";
import {
  getProductBySlug,
  listCategoryProducts,
  listProducts,
} from "@/lib/api/client";
import { catalogKeys } from "./keys";
import { listingQuery, type ListingFilters } from "./lib/filters";

export type ListingPages = InfiniteData<ProductListingResponse, number>;

async function fetchListingPage(
  category: string | null,
  filters: ListingFilters,
  page: number,
  signal: AbortSignal,
): Promise<ProductListingResponse> {
  const query = listingQuery(filters, page);
  const { data } = category
    ? await listCategoryProducts({
        path: { slug: category },
        query,
        signal,
        throwOnError: true,
      })
    : await listProducts({ query, signal, throwOnError: true });
  return data;
}

/**
 * A storefront listing as an infinite query. The server page seeds page 1
 * into the cache (HydrationBoundary), so the first render needs no request;
 * later pages load as the shopper scrolls. While new filters load, the
 * previous results stay on screen (keepPreviousData) instead of a skeleton.
 */
export function useListing(category: string | null, filters: ListingFilters) {
  return useInfiniteQuery({
    queryKey: catalogKeys.listing(category, filters),
    queryFn: ({ pageParam, signal }) =>
      fetchListingPage(category, filters, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: ({ meta }) =>
      meta.page < meta.total_pages ? meta.page + 1 : undefined,
    placeholderData: keepPreviousData,
    // Catalog data changes rarely; the server cache revalidates every 60 s.
    staleTime: 5 * 60_000,
  });
}

/**
 * A product's live variants (with stock), by slug: the product page's and
 * the bag's quick add share the cache entry.
 */
export async function fetchProductVariants(
  slug: string,
  signal: AbortSignal,
): Promise<StorefrontVariant[]> {
  const { data } = await getProductBySlug({
    path: { productSlug: slug },
    signal,
    throwOnError: true,
  });
  return data.data.variants;
}
