"use client";

import Link from "next/link";
import type { AdminCustomer } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { DefaultTag } from "@/modules/checkout/components/default-tag";
import { countryName } from "@/modules/checkout/lib/countries";
import { formatOrderDate, orderLabel } from "@/modules/checkout/lib/orders";
import { Stars } from "@/modules/reviews/components/stars";
import { adminOrdersSearch, EMPTY_ORDER_FILTERS } from "../lib/order-filters";
import { useAdminCustomer, useAdminOrders } from "../queries";
import { BackLink } from "./page-back";
import { AdminPageHeader } from "./page-header";
import { Panel } from "./panel";
import { OrderStatusBadge } from "./status-badge";

/** One customer: what they've spent, their orders, addresses and reviews. */
export function CustomerDetailView({ id }: { id: string }) {
  const customer = useAdminCustomer(id);

  if (customer.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading the customer">
        <BackLink href="/admin/customers">Customers</BackLink>
        <Skeleton className="mb-8 h-14 w-64" />
        <Skeleton className="mb-6 h-32 rounded-panel" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-80 rounded-panel" />
          <Skeleton className="h-64 rounded-panel" />
        </div>
      </div>
    );
  }

  if (customer.isError) {
    const code = getApiError(customer.error)?.code;
    const missing = code === "CUSTOMER_NOT_FOUND" || code === "INVALID_USER_ID";
    return (
      <div>
        <BackLink href="/admin/customers">Customers</BackLink>
        <h1 className="display text-4xl">
          {missing
            ? "There's no such customer."
            : "The customer couldn't load."}
        </h1>
        {!missing && (
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => customer.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  const c = customer.data;
  const figures = [
    { label: "Spent", value: formatPrice(c.spend) },
    { label: "Orders placed", value: String(c.orders) },
    { label: "Average order", value: formatPrice(c.average_order_value) },
    {
      label: "Last order",
      value: c.last_order_at ? formatOrderDate(c.last_order_at) : "None yet",
    },
  ];

  return (
    <div>
      <BackLink href="/admin/customers">Customers</BackLink>
      <AdminPageHeader
        eyebrow="Customer"
        title={c.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={`mailto:${c.email}`}
              className="hover:text-foreground hover:underline"
            >
              {c.email}
            </a>
            <span aria-hidden>·</span>
            <span>Joined {formatOrderDate(c.created_at)}</span>
          </span>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border xl:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="bg-card p-5">
            <dt className="eyebrow">{f.label}</dt>
            <dd className="mt-3 truncate font-serif text-2xl tabular-nums sm:text-3xl">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <CustomerOrders id={c.id} placed={c.orders} />
          <CustomerReviews reviews={c.reviews} />
        </div>
        <CustomerAddresses addresses={c.addresses} />
      </div>
    </div>
  );
}

/** How many of their latest orders the page lists; the table has the rest. */
const ORDERS_SHOWN = 8;

/**
 * Their latest orders, unpaid checkouts too (as the orders table shows
 * them), with a link to all of them in the orders table.
 */
function CustomerOrders({ id, placed }: { id: string; placed: number }) {
  const filters = { ...EMPTY_ORDER_FILTERS, customer: id };
  const orders = useAdminOrders(filters);
  const rows = (orders.data?.data ?? []).slice(0, ORDERS_SHOWN);
  const total = orders.data?.meta.total ?? 0;
  const tableHref = `/admin/orders${adminOrdersSearch(filters)}`;

  return (
    <Panel
      title="Orders"
      hint={orders.data ? String(total) : undefined}
      className="[&>div]:p-0"
    >
      {orders.isPending ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : orders.isError ? (
        <div className="p-5">
          <p className="mb-3 text-sm text-muted-foreground">
            Their orders couldn&apos;t load.
          </p>
          <Button variant="outline" onClick={() => orders.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.number}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 text-[0.8125rem] sm:grid-cols-[7rem_1fr_auto_auto]"
                >
                  <span className="font-mono text-xs group-hover:underline">
                    {orderLabel(o.number)}
                  </span>
                  <span className="hidden text-muted-foreground sm:block">
                    {formatOrderDate(o.created_at)} · {o.item_count}{" "}
                    {o.item_count === 1 ? "item" : "items"}
                  </span>
                  <span className="justify-self-end">
                    <OrderStatusBadge status={o.status} />
                  </span>
                  <span className="col-span-2 text-right tabular-nums sm:col-span-1 sm:min-w-20">
                    {formatPrice(o.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>
              {rows.length < total
                ? `The latest ${rows.length} of ${total}`
                : `All ${total}`}
              {total > placed ? ", unpaid checkouts included" : ""}.
            </span>
            <Link href={tableHref} className="text-foreground hover:underline">
              In the orders table
            </Link>
          </p>
        </>
      )}
    </Panel>
  );
}

function CustomerReviews({ reviews }: { reviews: AdminCustomer["reviews"] }) {
  return (
    <Panel
      title="Reviews"
      hint={reviews.length === 10 ? "10 latest" : String(reviews.length)}
    >
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <ul className="-my-4 divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-center justify-between gap-3">
                <Stars value={r.rating} size="size-3" />
                <span className="font-mono text-[0.625rem] text-muted-foreground">
                  {formatOrderDate(r.created_at)}
                </span>
              </div>
              <p className="mt-2 text-[0.8125rem] font-medium">
                {r.title}
                {r.status === "hidden" && (
                  <span className="ml-2 font-mono text-[0.5625rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    Hidden
                  </span>
                )}
              </p>
              <p className="mt-1 line-clamp-2 text-[0.8125rem] text-muted-foreground">
                {r.body}
              </p>
              <Link
                href={`/admin/products/${r.product_id}`}
                className="mt-1.5 inline-block text-xs hover:underline"
              >
                {r.product_name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CustomerAddresses({
  addresses,
}: {
  addresses: AdminCustomer["addresses"];
}) {
  return (
    <Panel title="Saved addresses" hint={String(addresses.length)}>
      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">None saved.</p>
      ) : (
        <ul className="-my-4 divide-y divide-border">
          {addresses.map((a) => (
            <li key={a.id} className="py-4">
              <address className="text-[0.8125rem] leading-relaxed not-italic">
                <span className="flex items-center gap-2">
                  {a.full_name}
                  {a.is_default && <DefaultTag />}
                </span>
                {a.line1}
                {a.line2 && `, ${a.line2}`}
                <br />
                {a.city}
                {a.region && `, ${a.region}`} {a.postal_code}
                <br />
                {countryName(a.country)}
                <br />
                <span className="text-muted-foreground">{a.phone}</span>
              </address>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
