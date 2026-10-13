import { Suspense } from "react";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getListing } from "../api";
import { catalogKeys } from "../keys";
import { parseFilters, type SearchParams } from "../lib/filters";
import type { ListingPages } from "../queries";
import { ListingView } from "./listing-view";
import { ListingSkeleton } from "./skeletons";

/**
 * Server half of a listing: fetches page 1 for the URL's filters and seeds
 * it into the client's query cache under the same key the grid will use, so
 * the first paint is server-rendered and needs no client request.
 */
export async function ListingPage({
  category,
  searchParams,
}: {
  category: string | null;
  searchParams: SearchParams;
}) {
  const filters = parseFilters(searchParams);
  const first = await getListing(category, filters);
  if (!first) notFound();

  const queryClient = new QueryClient();
  queryClient.setQueryData<ListingPages>(
    catalogKeys.listing(category, filters),
    {
      pages: [first],
      pageParams: [1],
    },
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<ListingSkeleton />}>
        <ListingView category={category} />
      </Suspense>
    </HydrationBoundary>
  );
}
