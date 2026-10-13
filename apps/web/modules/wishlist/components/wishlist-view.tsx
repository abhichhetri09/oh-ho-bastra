"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/hooks/use-in-view";
import { ProductCard } from "@/modules/catalog/components/product-card";
import { useSavedProducts } from "../hooks";
import { SavedItemAction } from "./saved-item-action";

/**
 * Saved products, 24 at a time as the page scrolls. Unsaving one (its
 * heart) takes it off the page straight away.
 */
export function WishlistView() {
  const { query, products } = useSavedProducts();
  const [sentinelRef, nearEnd] = useInView<HTMLDivElement>("600px");
  const {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isFetchNextPageError,
  } = query;

  useEffect(() => {
    if (
      nearEnd &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    nearEnd,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="display animate-rise text-5xl">Wishlist.</h1>
        {products.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {products.length}
            {hasNextPage ? "+" : ""} saved
          </p>
        )}
      </header>

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      ) : query.isError && !query.data ? (
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your wishlist."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          eyebrow="Nothing saved yet"
          title="Tap the heart on anything you love."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Browse the shop
            </Link>
          }
        >
          Saved pieces wait here, so you can come back to them.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 xl:grid-cols-3">
            {products.map((product, i) => (
              <div key={product.id} className="flex flex-col gap-3">
                <ProductCard product={product} index={i % 24} />
                <SavedItemAction product={product} className="self-start" />
              </div>
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center">
            {hasNextPage && (
              <Button
                variant="outline"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
