"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ProductWithPrice } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Collection } from "@/modules/catalog/api";
import { Price } from "@/modules/catalog/components/price";
import {
  filtersToSearch,
  isSearching,
  MAX_SEARCH,
  normalizeSearch,
  withSearch,
  DEFAULT_FILTERS,
} from "@/modules/catalog/lib/filters";
import { recentSearches } from "../lib/recent-searches";
import { useSearchPreview } from "../queries";

/** The /shop URL for a search. */
export function searchHref(q: string): string {
  return `/shop?${filtersToSearch(withSearch(DEFAULT_FILTERS, q))}`;
}

const noop = () => () => {};

/**
 * Site search: a header button (and ⌘K / Ctrl+K, or "/") opens a dialog
 * with live results as the shopper types. Enter searches the whole shop;
 * arrow keys reach the previewed products. With an empty box it offers
 * recent searches and the collections.
 */
export function SearchDialog({ collections }: { collections: Collection[] }) {
  const [open, setOpen] = useState(false);
  // ⌘ on Apple devices, Ctrl elsewhere; nothing during SSR.
  const shortcut = useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => null,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={
          <Button
            variant="ghost"
            className="gap-2 px-2.5 text-muted-foreground hover:text-foreground lg:px-3"
          />
        }
      >
        <MagnifyingGlassIcon weight="light" className="size-5" />
        <span className="sr-only lg:not-sr-only lg:text-[0.8125rem]">
          Search
        </span>
        {shortcut && (
          <kbd className="hidden h-5 items-center rounded-[calc(var(--radius-field)*0.4)] border border-border px-1.5 font-mono text-[0.625rem] tracking-wider text-muted-foreground lg:inline-flex">
            {shortcut}
          </kbd>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[oklch(0.2_0.012_60/0.32)] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl transition-[opacity,translate,scale] duration-300 ease-out-expo outline-none data-ending-style:opacity-0 data-starting-style:-translate-y-3 data-starting-style:opacity-0 sm:inset-auto sm:top-[10vh] sm:rounded-panel sm:left-1/2 sm:max-h-[min(40rem,80vh)] sm:w-[min(42rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:border sm:border-border">
          <DialogPrimitive.Title className="sr-only">
            Search the shop
          </DialogPrimitive.Title>
          {/* Mounted only while open, so every visit starts empty. */}
          <SearchPanel collections={collections} close={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SearchPanel({
  collections,
  close,
}: {
  collections: Collection[];
  close: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const q = normalizeSearch(input);
  const debounced = useDebouncedValue(q, 200);
  const searching = isSearching(q);
  const preview = useSearchPreview(debounced);
  const recent = useSyncExternalStore(
    recentSearches.subscribe,
    recentSearches.getSnapshot,
    recentSearches.getServerSnapshot,
  );

  // Results for an older query stay visible (dimmed) until the new ones land.
  const results = searching ? preview.data : undefined;
  const stale = searching && (debounced !== q || preview.isPlaceholderData);
  const loading = searching && preview.isFetching;

  function go(href: string) {
    close();
    router.push(href);
  }

  function searchFor(term: string) {
    const normalized = normalizeSearch(term);
    if (!isSearching(normalized)) return;
    recentSearches.add(normalized);
    go(searchHref(normalized));
  }

  return (
    <Command
      shouldFilter={false}
      loop
      className="min-h-0 flex-1 bg-transparent"
    >
      <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
        <MagnifyingGlassIcon
          weight="light"
          className="size-5 text-muted-foreground"
          aria-hidden
        />
        <CommandInput
          ref={inputRef}
          value={input}
          onValueChange={setInput}
          maxLength={MAX_SEARCH}
          placeholder="Search for linen, leather, lamps…"
          aria-label="Search products"
          className="h-full font-serif text-xl tracking-[-0.01em] sm:text-2xl"
          autoFocus
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput("");
              // The button unmounts; keep the shopper in the search box.
              inputRef.current?.focus();
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        )}
        <DialogPrimitive.Close
          render={<Button variant="ghost" size="icon" className="-mr-2" />}
        >
          <XIcon className="size-5" />
          <span className="sr-only">Close search</span>
        </DialogPrimitive.Close>
        <div
          className="absolute inset-x-0 -bottom-px h-px overflow-hidden"
          aria-hidden
        >
          {loading && (
            <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.1s_ease-in-out_infinite] bg-foreground" />
          )}
        </div>
      </div>

      <CommandList className="min-h-0 flex-1 pb-3 sm:max-h-[calc(min(40rem,80vh)-4rem)]">
        {searching ? (
          <>
            <CommandGroup>
              <CommandItem
                value="search-all"
                onSelect={() => searchFor(q)}
                className="py-3"
              >
                <MagnifyingGlassIcon className="text-muted-foreground" />
                <span className="truncate">
                  Search for <span className="font-medium">“{q}”</span>
                </span>
                <ArrowRightIcon className="ml-auto text-muted-foreground" />
              </CommandItem>
            </CommandGroup>

            {results && results.products.length > 0 && (
              <CommandGroup
                heading={`Products · ${results.total}`}
                className={stale ? "opacity-50 transition-opacity" : undefined}
              >
                {results.products.map((product, i) => (
                  <ProductResult
                    key={product.id}
                    product={product}
                    index={i}
                    onSelect={() => go(`/products/${product.slug}`)}
                  />
                ))}
                {results.total > results.products.length && (
                  <CommandItem
                    value="see-all"
                    onSelect={() => searchFor(q)}
                    className="text-[0.8125rem] text-muted-foreground"
                  >
                    See all {results.total} results
                    <ArrowRightIcon className="ml-auto" />
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {results && results.total === 0 && !stale && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nothing matches “{debounced}”. Try a broader word.
              </p>
            )}

            {preview.isError && !results && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Search is unavailable right now. Press Enter to try the full
                results page.
              </p>
            )}
          </>
        ) : (
          <>
            {recent.length > 0 && (
              <CommandGroup heading="Recent searches">
                {recent.map((term) => (
                  <CommandItem
                    key={term}
                    value={`recent:${term}`}
                    onSelect={() => searchFor(term)}
                  >
                    <ClockCounterClockwiseIcon className="text-muted-foreground" />
                    <span className="truncate">{term}</span>
                    <ArrowUpRightIcon className="ml-auto text-muted-foreground" />
                  </CommandItem>
                ))}
                <button
                  type="button"
                  onClick={() => recentSearches.clear()}
                  className="link-underline mx-5 mt-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear recent searches
                </button>
              </CommandGroup>
            )}
            <CommandGroup heading="Collections">
              {collections.map((collection) => (
                <CommandItem
                  key={collection.slug}
                  value={`collection:${collection.slug}`}
                  onSelect={() => go(`/categories/${collection.slug}`)}
                >
                  <span>{collection.name}</span>
                  <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                    {collection.total}
                  </span>
                </CommandItem>
              ))}
              <CommandItem value="collection:all" onSelect={() => go("/shop")}>
                <span>Shop all</span>
                <ArrowRightIcon className="ml-auto text-muted-foreground" />
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Screen readers hear how many products matched. */}
      <p className="sr-only" aria-live="polite">
        {searching && results && !stale
          ? `${results.total} ${results.total === 1 ? "product" : "products"} found`
          : ""}
      </p>
    </Command>
  );
}

function ProductResult({
  product,
  index,
  onSelect,
}: {
  product: ProductWithPrice;
  index: number;
  onSelect: () => void;
}) {
  const image = product.images[0];
  return (
    <CommandItem
      value={`product:${product.slug}`}
      onSelect={onSelect}
      className="animate-rise gap-4 py-2"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="relative aspect-[4/5] w-11 shrink-0 overflow-hidden rounded-media bg-surface">
        {image && (
          <Image
            src={image}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate">{product.name}</span>
      <Price
        price={product.price}
        selling={product.selling_price}
        offer={product.offer_price}
        className="shrink-0 text-[0.8125rem]"
      />
    </CommandItem>
  );
}
