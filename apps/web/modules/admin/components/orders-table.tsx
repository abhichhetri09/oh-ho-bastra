"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  DownloadSimpleIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { OrderSort, OrderStatus, SortDir } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminExportOrders } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatOrderDate, orderLabel } from "@/modules/checkout/lib/orders";
import {
  adminOrdersExportQuery,
  adminOrdersSearch,
  EMPTY_ORDER_FILTERS,
  type AdminOrderFilters,
} from "../lib/order-filters";
import { useAdminCounts, useAdminOrders } from "../queries";
import { FilterableHead } from "./filterable-head";
import { PageNav } from "./page-nav";
import { SortableHead } from "./sortable-head";
import { OrderStatusBadge } from "./status-badge";

const PATH = "/admin/orders";
/** The API's cap on one CSV export. */
const MAX_EXPORT_ROWS = 10_000;

/** The status tabs; "To ship" is the paid orders waiting for the warehouse. */
const tabs: { label: string; status: OrderStatus | "" }[] = [
  { label: "All", status: "" },
  { label: "To ship", status: "paid" },
  { label: "Shipped", status: "shipped" },
  { label: "Delivered", status: "delivered" },
  { label: "Awaiting payment", status: "pending" },
  { label: "Cancelled", status: "cancelled" },
  { label: "Refunded", status: "refunded" },
];

export function OrdersTable({ initial }: { initial: AdminOrderFilters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState(initial.q);
  const debounced = useDebouncedValue(search.trim(), 300);
  const orders = useAdminOrders(filters);
  // Store-wide counts, so only shown while nothing narrows the list.
  const allCounts = useAdminCounts().data?.orders_by_status;
  const counts = filters.q || filters.customer ? undefined : allCounts;

  useEffect(() => {
    setFilters((f) =>
      f.q === debounced ? f : { ...f, q: debounced, page: 1 },
    );
  }, [debounced]);

  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminOrdersSearch(filters));
  }, [filters]);

  const outOfRange =
    orders.isError &&
    getApiError(orders.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  // The CSV comes through the API client (it refreshes an expired session),
  // then downloads from memory.
  const exporting = useMutation({
    mutationFn: async () => {
      const { data } = await adminExportOrders({
        query: adminOrdersExportQuery(filters),
        throwOnError: true,
      });
      return data as string;
    },
    onSuccess: (csv) => {
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      if (meta && meta.total > MAX_EXPORT_ROWS) {
        toast(`Exported the first ${MAX_EXPORT_ROWS.toLocaleString()} orders`, {
          description: "Narrow the dates to export the rest.",
        });
      }
    },
    onError: (error) => {
      toast.error(getApiError(error)?.message ?? "Couldn't export the orders.");
    },
  });

  const sortProps = {
    sort: filters.sort,
    dir: filters.dir,
    onSort: (sort: OrderSort, dir: SortDir) =>
      setFilters((f) => ({ ...f, sort, dir, page: 1 })),
  };
  const rows = orders.data?.data ?? [];
  const meta = orders.data?.meta;
  const filtered = Boolean(
    filters.q ||
    filters.status ||
    filters.customer ||
    filters.from ||
    filters.to,
  );

  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Order status"
        className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={filters.status === tab.status}
            onClick={() =>
              setFilters((f) => ({ ...f, status: tab.status, page: 1 }))
            }
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 pb-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
          >
            {tab.label}
            {counts && (
              <span className="ml-1.5 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
                {tab.status === ""
                  ? Object.values(counts).reduce((a, b) => a + b, 0)
                  : counts[tab.status]}
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
            placeholder="Order number (OHB-1042) or email"
            aria-label="Search orders"
            className="h-10 pl-9"
            maxLength={100}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) =>
              setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))
            }
            aria-label="Placed from"
            className="h-10 w-[9.5rem]"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) =>
              setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))
            }
            aria-label="Placed to"
            className="h-10 w-[9.5rem]"
          />
          <Button
            variant="outline"
            className="h-10"
            disabled={exporting.isPending || meta?.total === 0}
            onClick={() => exporting.mutate()}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            {exporting.isPending ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {filters.customer && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-border px-3 py-2 text-[0.8125rem]">
          <span>
            Showing one customer&apos;s orders.{" "}
            <Link
              href={`/admin/customers/${filters.customer}`}
              className="underline underline-offset-4 hover:text-muted-foreground"
            >
              View the customer
            </Link>
          </span>
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, customer: "", page: 1 }))}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3" />
            Everyone&apos;s orders
          </button>
        </div>
      )}

      <div className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite">
          {meta
            ? `${meta.total} ${meta.total === 1 ? "order" : "orders"}`
            : " "}
        </p>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilters((f) => ({
                ...EMPTY_ORDER_FILTERS,
                sort: f.sort,
                dir: f.dir,
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
          orders.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <FilterableHead
                label="Status"
                value={filters.status}
                options={tabs.map((t) => ({ value: t.status, label: t.label }))}
                onChange={(status) =>
                  setFilters((f) => ({ ...f, status, page: 1 }))
                }
              />
              <SortableHead
                field="created"
                label="Placed"
                isDefault
                {...sortProps}
              />
              <SortableHead
                field="total"
                label="Total"
                {...sortProps}
                className="text-right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              ))
            ) : orders.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The orders couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => orders.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center">
                  <p className="font-serif text-2xl">
                    {filtered ? "No orders match." : "No orders yet."}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {filtered
                      ? "Try another number or email, or another tab."
                      : "They appear here as soon as a checkout starts."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((order) => (
                <TableRow
                  key={order.id}
                  // Row clicks route here, not via a stretched link: mobile
                  // Safari ignores position on <tr>, so the overlay of every
                  // row would cover the whole table.
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a")) return;
                    router.push(`${PATH}/${order.number}`);
                  }}
                  className="group cursor-pointer"
                >
                  <TableCell>
                    <Link
                      href={`${PATH}/${order.number}`}
                      className="block outline-none focus-visible:underline"
                    >
                      <span className="font-mono text-xs group-hover:underline">
                        {orderLabel(order.number)}
                      </span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        {order.item_count}{" "}
                        {order.item_count === 1 ? "item" : "items"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    {order.guest ? (
                      // No account: the order's email is all there is.
                      <span className="eyebrow inline-block rounded-control border border-border px-1.5 py-0.5 !text-[0.5625rem]">
                        Guest
                      </span>
                    ) : (
                      <span className="block truncate">
                        {order.customer_name}
                      </span>
                    )}
                    <span className="block truncate text-[0.6875rem] text-muted-foreground">
                      {order.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatOrderDate(order.created_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(order.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(page) => PATH + adminOrdersSearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
