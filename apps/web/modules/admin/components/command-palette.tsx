"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowSquareOutIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatPrice } from "@/lib/money";
import { orderLabel } from "@/modules/checkout/lib/orders";
import { useAdminSearch } from "../queries";
import { groups } from "./admin-nav";
import { OrderStatusBadge } from "./status-badge";

const noop = () => () => {};

const pages = groups.flatMap((g) => g.links);

/**
 * The admin's command palette: ⌘K / Ctrl+K (or the top-bar button) finds
 * orders, products and customers as you type, and jumps to any section.
 */
export function CommandPalette() {
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
            variant="outline"
            className="h-9 gap-2 px-2.5 text-muted-foreground hover:text-foreground sm:w-56 sm:justify-start sm:px-3"
          />
        }
      >
        <MagnifyingGlassIcon className="size-4" />
        <span className="sr-only sm:not-sr-only sm:text-[0.8125rem]">
          Search admin
        </span>
        {shortcut && (
          <kbd className="ml-auto hidden h-5 items-center rounded-[calc(var(--radius-field)*0.4)] border border-border px-1.5 font-mono text-[0.625rem] tracking-wider sm:inline-flex">
            {shortcut}
          </kbd>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[oklch(0.2_0.012_60/0.32)] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl transition-[opacity,translate,scale] duration-300 ease-out-expo outline-none data-ending-style:opacity-0 data-starting-style:-translate-y-3 data-starting-style:opacity-0 sm:inset-auto sm:top-[10vh] sm:left-1/2 sm:max-h-[min(36rem,80vh)] sm:w-[min(40rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-panel sm:border sm:border-border">
          <DialogPrimitive.Title className="sr-only">
            Search the admin
          </DialogPrimitive.Title>
          {/* Mounted only while open, so every visit starts empty. */}
          <Palette close={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Palette({ close }: { close: () => void }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const q = input.trim().slice(0, 100);
  const debounced = useDebouncedValue(q, 200);
  const search = useAdminSearch(debounced);
  const results = q ? search.data : undefined;
  const stale = Boolean(q) && (debounced !== q || search.isPlaceholderData);
  const needle = q.toLowerCase();
  const matchingPages = pages.filter((p) =>
    p.label.toLowerCase().includes(needle),
  );
  const found =
    results &&
    results.orders.length + results.products.length + results.customers.length;

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <Command
      shouldFilter={false}
      loop
      className="min-h-0 flex-1 bg-transparent"
    >
      <div className="relative flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <MagnifyingGlassIcon
          className="size-5 text-muted-foreground"
          aria-hidden
        />
        <CommandInput
          value={input}
          onValueChange={setInput}
          maxLength={100}
          placeholder="Order number, email, product, SKU or name…"
          aria-label="Search orders, products and customers"
          className="h-full text-[0.9375rem]"
          autoFocus
        />
        <DialogPrimitive.Close
          render={<Button variant="ghost" size="icon" className="-mr-2" />}
        >
          <XIcon className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        <div
          className="absolute inset-x-0 -bottom-px h-px overflow-hidden"
          aria-hidden
        >
          {q && search.isFetching && (
            <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.1s_ease-in-out_infinite] bg-foreground" />
          )}
        </div>
      </div>

      <CommandList
        className={`min-h-0 flex-1 pb-3 transition-opacity sm:max-h-[calc(min(36rem,80vh)-3.5rem)] ${stale ? "opacity-60" : ""}`}
      >
        {results && results.orders.length > 0 && (
          <CommandGroup heading="Orders">
            {results.orders.map((o) => (
              <CommandItem
                key={o.id}
                value={`order-${o.number}`}
                onSelect={() => go(`/admin/orders/${o.number}`)}
              >
                <span className="w-16 shrink-0 font-mono text-xs">
                  {orderLabel(o.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">
                  {o.email}
                </span>
                <OrderStatusBadge status={o.status} />
                <span className="w-20 shrink-0 text-right text-[0.8125rem] tabular-nums">
                  {formatPrice(o.total)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.products.length > 0 && (
          <CommandGroup heading="Products">
            {results.products.map((p) => (
              <CommandItem
                key={p.id}
                value={`product-${p.id}`}
                onSelect={() => go(`/admin/products/${p.id}`)}
              >
                <span className="relative size-8 shrink-0 overflow-hidden rounded-media bg-muted">
                  {p.image && (
                    <Image
                      src={p.image}
                      alt=""
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {p.name}
                </span>
                {!p.is_active && (
                  <span className="font-mono text-[0.5625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    Hidden
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {results.customers.map((c) => (
              <CommandItem
                key={c.id}
                value={`customer-${c.id}`}
                onSelect={() => go(`/admin/customers/${c.id}`)}
              >
                <UserIcon className="text-muted-foreground" />
                <span className="truncate text-[0.8125rem]">{c.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {c.email}
                </span>
                <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
                  {c.orders} {c.orders === 1 ? "order" : "orders"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {q && found === 0 && !stale && matchingPages.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nothing matches “{debounced}”.
          </p>
        )}
        {q && search.isError && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">
            Search is unavailable right now.
          </p>
        )}

        {matchingPages.length > 0 && (
          <CommandGroup heading="Go to">
            {matchingPages.map(({ label, href, icon: Icon }) => (
              <CommandItem
                key={href}
                value={`page-${href}`}
                onSelect={() => go(href)}
              >
                <Icon className="text-muted-foreground" weight="light" />
                <span className="text-[0.8125rem]">{label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!q && (
          <CommandGroup heading="Actions">
            <CommandItem
              value="new-product"
              onSelect={() => go("/admin/products/new")}
            >
              <PlusIcon className="text-muted-foreground" />
              <span className="text-[0.8125rem]">Add a product</span>
            </CommandItem>
            <CommandItem
              value="view-store"
              onSelect={() => {
                close();
                window.open("/", "_blank", "noopener");
              }}
            >
              <ArrowSquareOutIcon className="text-muted-foreground" />
              <span className="text-[0.8125rem]">View the store</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
