import type { ListingFilters } from "./lib/filters";

// TanStack Query keys for catalog data. The server prefetch and the client
// hooks must build identical keys, so they only come from here.
export const catalogKeys = {
  all: ["catalog"] as const,
  listing: (category: string | null, filters: ListingFilters) =>
    [...catalogKeys.all, "listing", category, filters] as const,
  /** A product page's live variants (stock), by slug. */
  product: (slug: string) => [...catalogKeys.all, "product", slug] as const,
  /** Live search results; `q` is normalised and lowercased. */
  search: (q: string) => [...catalogKeys.all, "search", q] as const,
};
