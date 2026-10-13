"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { AdminInventoryResponse, StockLevel } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import { orderTree } from "../lib/categories";
import {
  adminInventorySearch,
  type AdminInventoryFilters,
} from "../lib/order-filters";
import { adminKeys } from "../keys";
import { useAdminInventory, useCategoryTree } from "../queries";
import { PageNav } from "./page-nav";
import { StockInput } from "./stock-input";

const PATH = "/admin/inventory";
const ALL = "all";

const tabs: {
  label: string;
  stock: StockLevel | "";
  count: (c: AdminInventoryResponse["data"]["counts"]) => number;
}[] = [
  {
    label: "All",
    stock: "",
    count: (c) => c.out_of_stock + c.low + c.in_stock,
  },
  { label: "Sold out", stock: "out", count: (c) => c.out_of_stock },
  { label: "Low (1–5)", stock: "low", count: (c) => c.low },
  { label: "In stock", stock: "in", count: (c) => c.in_stock },
];

/**
 * Stock by variant, lowest first, edited in place. A saved count updates
 * its row where it is; the order catches up on the next load.
 */
export function InventoryTable({
  initial,
}: {
  initial: AdminInventoryFilters;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState(initial.q);
  const debounced = useDebouncedValue(search.trim(), 300);
  const inventory = useAdminInventory(filters);
  const tree = useCategoryTree();
  const categoryItems = useMemo(
    () => [
      { value: ALL, label: "All categories", depth: 0 },
      ...orderTree(tree.data ?? []).map((c) => ({
        value: c.slug,
        label: c.name,
        depth: c.depth,
      })),
    ],
    [tree.data],
  );

  useEffect(() => {
    setFilters((f) =>
      f.q === debounced ? f : { ...f, q: debounced, page: 1 },
    );
  }, [debounced]);

  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminInventorySearch(filters));
  }, [filters]);

  const outOfRange =
    inventory.isError &&
    getApiError(inventory.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  /** Shows a saved count in its row without re-sorting the page. */
  function patch(variantId: string, stock: number) {
    queryClient.setQueryData<AdminInventoryResponse>(
      adminKeys.inventoryList(filters),
      (page) =>
        page && {
          ...page,
          data: {
            ...page.data,
            rows: page.data.rows.map((r) =>
              r.variant_id === variantId ? { ...r, stock } : r,
            ),
          },
        },
    );
  }

  const rows = inventory.data?.data.rows ?? [];
  const counts = inventory.data?.data.counts;
  const meta = inventory.data?.meta;
  const filtered = Boolean(filters.q || filters.category || filters.hidden);

  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Stock level"
        className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={filters.stock === tab.stock}
            onClick={() =>
              setFilters((f) => ({ ...f, stock: tab.stock, page: 1 }))
            }
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 pb-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
          >
            {tab.label}
            {counts && (
              <span
                className={cn(
                  "ml-1.5 font-mono text-[0.625rem] tabular-nums",
                  tab.stock === "out" && tab.count(counts) > 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {tab.count(counts)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product name or SKU"
            aria-label="Search inventory"
            className="h-10 pl-9"
            maxLength={100}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select
            value={filters.category || ALL}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                category: !value || value === ALL ? "" : value,
                page: 1,
              }))
            }
            items={categoryItems}
          >
            <SelectTrigger
              aria-label="Category"
              className="h-10 w-full sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span style={{ paddingLeft: `${item.depth}rem` }}>
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2.5 text-[0.8125rem]">
            <Switch
              checked={filters.hidden}
              onCheckedChange={(hidden) =>
                setFilters((f) => ({ ...f, hidden, page: 1 }))
              }
            />
            Hidden too
          </label>
        </div>
      </div>

      <div className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite">
          {meta
            ? `${meta.total} ${meta.total === 1 ? "variant" : "variants"}${filters.hidden ? "" : " on sale"}`
            : " "}
        </p>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilters((f) => ({
                ...f,
                q: "",
                category: "",
                hidden: false,
                page: 1,
              }));
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <XIcon className="size-3" />
            Clear filters
          </button>
        )}
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          inventory.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="md:min-w-[40rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Variant</TableHead>
              <TableHead className="hidden md:table-cell">SKU</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                Price
              </TableHead>
              <TableHead className="pr-8 text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.isPending ? (
              Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              ))
            ) : inventory.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The inventory couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => inventory.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16 text-center">
                  <p className="font-serif text-2xl">
                    {filters.stock === "out" && !filtered
                      ? "Nothing is sold out."
                      : "No variants match."}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {filters.stock === "out" && !filtered
                      ? "Every variant on sale has stock."
                      : "Try another search, category or tab."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const options = optionSummary(row);
                const label = options
                  ? `${row.product_name}, ${options}`
                  : row.product_name;
                const hidden = !row.is_active || !row.product_active;
                return (
                  <TableRow key={row.variant_id}>
                    <TableCell className="max-w-[22rem]">
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-media bg-muted">
                          {row.image && (
                            <Image
                              src={row.image}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/products/${row.product_id}#variants`}
                            className="block truncate hover:underline"
                          >
                            {row.product_name}
                          </Link>
                          <span className="block truncate text-[0.6875rem] text-muted-foreground">
                            {options || "One size"}
                            {hidden && (
                              <span className="ml-2 font-mono text-[0.5625rem] tracking-[0.14em] uppercase">
                                Hidden
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-[0.6875rem] text-muted-foreground md:table-cell">
                      {row.sku ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatPrice(row.selling_price)}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <StockInput
                        productId={row.product_id}
                        variantId={row.variant_id}
                        stock={row.stock}
                        label={label}
                        onSaved={(stock) => patch(row.variant_id, stock)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(page) => PATH + adminInventorySearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
