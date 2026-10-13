"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listProducts } from "@/lib/api/client";
import { catalogKeys } from "@/modules/catalog/keys";
import { isSearching, normalizeSearch } from "@/modules/catalog/lib/filters";

/** How many products the search dialog previews. */
export const PREVIEW_SIZE = 6;

/**
 * The first page of a search, for the live results in the search dialog.
 * Searches differing only in case or spacing share one cache entry, and
 * the previous results stay up while the next ones load.
 */
export function useSearchPreview(raw: string) {
  const q = normalizeSearch(raw).toLowerCase();
  return useQuery({
    queryKey: catalogKeys.search(q),
    queryFn: async ({ signal }) => {
      const { data } = await listProducts({
        query: { q },
        signal,
        throwOnError: true,
      });
      return {
        products: data.data.products.slice(0, PREVIEW_SIZE),
        total: data.meta.total,
      };
    },
    enabled: isSearching(q),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
