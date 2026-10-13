"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FadersHorizontalIcon, XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useInView } from "@/hooks/use-in-view";
import { formatPriceShort } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useListingFilters } from "../hooks/use-listing-filters";
import {
  activeFilterCount,
  clearFilters,
  sortOptionsFor,
  toggleOption,
  withSearch,
  type ListingFilters,
} from "../lib/filters";
import { optionLabel } from "../lib/option-order";
import { useListing } from "../queries";
import { FilterPanel } from "./filter-panel";
import { ProductCard } from "./product-card";
import { GRID_CLASSES } from "./product-grid";
import { SortMenu } from "./sort-menu";

/**
 * A storefront listing: sticky toolbar, filters (sidebar on desktop, sheet
 * on mobile), active filter pills and an infinitely scrolling grid. Page 1
 * comes from the server-seeded cache; the rest loads as the shopper nears
 * the end, with a "Load more" button for keyboard and screen reader users.
 */
export function ListingView({ category }: { category: string | null }) {
  const { filters, setFilters } = useListingFilters();
  const query = useListing(category, filters);
  const topRef = useRef<HTMLDivElement>(null);
  const [sentinelRef, nearEnd] = useInView<HTMLDivElement>("800px");

  const first = query.data?.pages[0];
  const products = query.data?.pages.flatMap((p) => p.data.products) ?? [];
  const total = first?.meta.total ?? 0;
  const facets = first?.data.filter_options ?? [];
  const priceRange = first?.data.price_range ?? { min_price: 0, max_price: 0 };
  const active = activeFilterCount(filters);
  const updating = query.isPlaceholderData;

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

  useEffect(() => {
    if (isFetchNextPageError) toast.error("Couldn't load more products.");
  }, [isFetchNextPageError]);

  function change(next: ListingFilters) {
    setFilters(next);
    // Deep in the grid, jump back to the top of the results.
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const panel = (
    <FilterPanel
      filters={filters}
      onChange={change}
      facets={facets}
      priceRange={priceRange}
    />
  );

  return (
    <div ref={topRef} className="scroll-mt-16">
      {/* Toolbar */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex h-12 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <MobileFilters
              panel={panel}
              total={total}
              active={active}
              updating={updating}
              onClear={() => change(clearFilters(filters))}
            />
            <p
              className="text-[0.8125rem] text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {query.isPending
                ? "Loading…"
                : `${total} ${total === 1 ? "product" : "products"}`}
            </p>
          </div>
          <SortMenu
            value={filters.sort}
            options={sortOptionsFor(filters.q)}
            onChange={(sort) => change({ ...filters, sort })}
          />
        </div>
        {/* Indeterminate progress while new filters load. */}
        <div className="relative h-px overflow-hidden" aria-hidden>
          {updating && (
            <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.1s_ease-in-out_infinite] bg-foreground" />
          )}
        </div>
      </div>

      <div className="grid gap-10 pt-6 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-32 max-h-[calc(100svh-9rem)] overflow-y-auto pr-2 no-scrollbar">
            {panel}
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0">
          <ActivePills filters={filters} onChange={change} />

          {query.isError && !query.data ? (
            <EmptyState
              eyebrow="Something went wrong"
              title="We couldn't load these products."
              action={
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : total === 0 && !query.isPending && !updating ? (
            <NoResults filters={filters} onChange={change} />
          ) : (
            <>
              <div
                className={cn(
                  GRID_CLASSES,
                  "transition-opacity duration-300",
                  updating && "pointer-events-none opacity-45",
                )}
              >
                {products.map((product, i) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    // Appended pages restart the stagger at their own top.
                    index={i % 24}
                    eager={i < 4}
                  />
                ))}
              </div>

              <div
                ref={sentinelRef}
                className="flex flex-col items-center gap-4 pt-16 pb-4"
              >
                {total > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Showing {products.length} of {total}
                    </p>
                    <div className="h-px w-48 bg-border" aria-hidden>
                      <div
                        className="h-px bg-foreground transition-[width] duration-700 ease-out-expo"
                        style={{ width: `${(products.length / total) * 100}%` }}
                      />
                    </div>
                  </>
                )}
                {hasNextPage && (
                  <Button
                    variant="outline"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="mt-2 min-w-40"
                  >
                    {isFetchingNextPage
                      ? "Loading…"
                      : isFetchNextPageError
                        ? "Try again"
                        : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MobileFilters({
  panel,
  total,
  active,
  updating,
  onClear,
}: {
  panel: React.ReactNode;
  total: number;
  active: number;
  updating: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="-ml-3 lg:hidden" />
        }
      >
        <FadersHorizontalIcon />
        Filter
        {active > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.625rem] text-primary-foreground">
            {active}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="left" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="eyebrow !text-foreground">Filter</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5">{panel}</div>
        <SheetFooter className="flex-row gap-2 border-t border-border p-4">
          {active > 0 && (
            <Button
              variant="outline"
              size="lg"
              className="shrink-0"
              onClick={onClear}
            >
              Clear all
            </Button>
          )}
          <SheetClose render={<Button size="lg" className="flex-1" />}>
            {updating
              ? "Updating…"
              : `Show ${total} ${total === 1 ? "product" : "products"}`}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NoResults({
  filters,
  onChange,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
}) {
  const active = activeFilterCount(filters) > 0;

  if (filters.q) {
    return (
      <EmptyState
        eyebrow="No results"
        title={`Nothing found for “${filters.q}”${active ? " with these filters" : ""}.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {active && (
              <Button onClick={() => onChange(clearFilters(filters))}>
                Clear filters
              </Button>
            )}
            <Button
              variant={active ? "outline" : "default"}
              onClick={() => onChange(withSearch(filters, ""))}
            >
              Clear search
            </Button>
          </div>
        }
      >
        Check the spelling, or try a broader word such as “shirt” or “leather”.
      </EmptyState>
    );
  }

  return (
    <EmptyState
      eyebrow="No results"
      title={
        active
          ? "Nothing matches these filters."
          : "This collection is resting."
      }
      action={
        active ? (
          <Button onClick={() => onChange(clearFilters(filters))}>
            Clear filters
          </Button>
        ) : (
          <Link href="/shop" className={buttonVariants()}>
            Browse everything
          </Link>
        )
      }
    >
      {active
        ? "Try removing a filter or widening the price range."
        : "New pieces arrive often. In the meantime, the rest of the shop is open."}
    </EmptyState>
  );
}

function ActivePills({
  filters,
  onChange,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
}) {
  const count = activeFilterCount(filters);
  if (count === 0 && !filters.q) return null;

  const pills: { label: string; remove: () => void }[] = [];
  if (filters.q) {
    pills.push({
      label: `Search: ${filters.q}`,
      remove: () => onChange(withSearch(filters, "")),
    });
  }
  for (const option of filters.options) {
    const at = option.indexOf(":");
    const name = option.slice(0, at);
    const value = option.slice(at + 1);
    pills.push({
      label: `${optionLabel(name)}: ${value}`,
      remove: () => onChange(toggleOption(filters, name, value)),
    });
  }
  if (filters.priceMin > 0 || filters.priceMax > 0) {
    const lo = filters.priceMin ? formatPriceShort(filters.priceMin) : "Any";
    const hi = filters.priceMax ? formatPriceShort(filters.priceMax) : "any";
    pills.push({
      label: `${lo} – ${hi}`,
      remove: () => onChange({ ...filters, priceMin: 0, priceMax: 0 }),
    });
  }
  if (filters.featured) {
    pills.push({
      label: "Editor's picks",
      remove: () => onChange({ ...filters, featured: false }),
    });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {pills.map((pill) => (
        <button
          key={pill.label}
          type="button"
          onClick={pill.remove}
          className="animate-rise group inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-secondary/60 pr-2 pl-3 text-xs transition-colors hover:border-foreground"
          aria-label={`Remove ${pill.label}`}
        >
          {pill.label}
          <XIcon className="size-3 text-muted-foreground transition-transform duration-300 group-hover:rotate-90 group-hover:text-foreground" />
        </button>
      ))}
      {count > 0 && (
        <button
          type="button"
          onClick={() => onChange(clearFilters(filters))}
          className="link-underline ml-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
