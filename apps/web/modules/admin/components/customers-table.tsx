"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { CustomerSort, SortDir } from "@repo/types";
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
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import {
  adminCustomersSearch,
  type AdminCustomerFilters,
} from "../lib/order-filters";
import { useAdminCustomers } from "../queries";
import { PageNav } from "./page-nav";
import { SortableHead } from "./sortable-head";

const PATH = "/admin/customers";

export function CustomersTable({ initial }: { initial: AdminCustomerFilters }) {
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState(initial.q);
  const debounced = useDebouncedValue(search.trim(), 300);
  const customers = useAdminCustomers(filters);

  useEffect(() => {
    setFilters((f) =>
      f.q === debounced ? f : { ...f, q: debounced, page: 1 },
    );
  }, [debounced]);

  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminCustomersSearch(filters));
  }, [filters]);

  const outOfRange =
    customers.isError &&
    getApiError(customers.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  const sortProps = {
    sort: filters.sort,
    dir: filters.dir,
    onSort: (sort: CustomerSort, dir: SortDir) =>
      setFilters((f) => ({ ...f, sort, dir, page: 1 })),
  };
  const rows = customers.data?.data ?? [];
  const meta = customers.data?.meta;

  return (
    <div className="space-y-5">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email"
          aria-label="Search customers"
          className="h-10 pl-9"
          maxLength={100}
        />
      </div>

      <div className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite">
          {meta
            ? `${meta.total} ${meta.total === 1 ? "customer" : "customers"}`
            : " "}
        </p>
        {filters.q && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilters((f) => ({ ...f, page: 1, q: "" }));
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <XIcon className="size-3" />
            Clear search
          </button>
        )}
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          customers.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="md:min-w-[44rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Customer</TableHead>
              <SortableHead
                field="orders"
                label="Orders"
                {...sortProps}
                className="text-right"
              />
              <SortableHead
                field="spend"
                label="Spent"
                {...sortProps}
                className="text-right"
              />
              <TableHead className="hidden md:table-cell">Last order</TableHead>
              <SortableHead
                field="joined"
                label="Joined"
                isDefault
                {...sortProps}
                className="hidden lg:table-cell"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-10" />
                  </TableCell>
                </TableRow>
              ))
            ) : customers.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The customers couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => customers.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center">
                  <p className="font-serif text-2xl">
                    {filters.q ? "No customers match." : "No customers yet."}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {filters.q
                      ? "Try part of a name or an email."
                      : "They appear here when they sign up."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="group relative cursor-pointer"
                >
                  <TableCell className="max-w-[18rem]">
                    <Link
                      href={`${PATH}/${customer.id}`}
                      className="block outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      <span className="block truncate group-hover:underline">
                        {customer.name}
                      </span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">
                        {customer.email}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {customer.orders}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(customer.spend)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {customer.last_order_at
                      ? formatOrderDate(customer.last_order_at)
                      : "None yet"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatOrderDate(customer.created_at)}
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
          href={(page) => PATH + adminCustomersSearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
