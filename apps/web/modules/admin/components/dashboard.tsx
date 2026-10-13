"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  PackageIcon,
  TruckIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { AdminStats, OrderStatus, StatsRange } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatOrderDate, orderLabel } from "@/modules/checkout/lib/orders";
import { Stars } from "@/modules/reviews/components/stars";
import {
  change,
  type Change,
  DEFAULT_STATS_RANGE,
  STATS_RANGES,
} from "../lib/stats";
import { useAdminStats } from "../queries";
import { Panel } from "./panel";
import { SalesChart } from "./sales-chart";
import { OrderStatusBadge } from "./status-badge";

const count = new Intl.NumberFormat("en-US");

const PATH = "/admin";

export function Dashboard({ initialRange }: { initialRange: StatsRange }) {
  const [range, setRange] = useState(initialRange);
  const {
    data: stats,
    isPending,
    isError,
    isPlaceholderData,
    refetch,
  } = useAdminStats(range);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      range === DEFAULT_STATS_RANGE ? PATH : `${PATH}?range=${range}`,
    );
  }, [range]);

  const days = STATS_RANGES.find((r) => r.value === range)!;
  const label = `Last ${days.label}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">
          {label}, against the {days.label} before.
        </p>
        <div
          role="group"
          aria-label="Period"
          className="inline-flex rounded-control border border-border p-0.5"
        >
          {STATS_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className="h-8 rounded-[calc(var(--radius-control)-2px)] px-3 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {r.value}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <DashboardSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-start gap-4 rounded-panel border border-border p-8">
          <p className="text-sm text-muted-foreground">
            The dashboard couldn&apos;t load.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div
          aria-busy={isPlaceholderData}
          className={cn(
            "space-y-6 transition-opacity",
            isPlaceholderData && "opacity-60",
          )}
        >
          <Kpis stats={stats} period={days.label} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel title="Sales">
              <SalesChart days={stats.series} label={label} />
            </Panel>
            <div className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
              <NeedsAttention attention={stats.needs_attention} />
              <OrdersByStatus counts={stats.orders_by_status} />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <TopProducts products={stats.top_products} label={label} />
            <RecentReviews reviews={stats.recent_reviews} />
            <LowStock items={stats.low_stock} />
          </div>

          <RecentOrders orders={stats.recent_orders} />

          <div className="flex flex-wrap gap-3">
            <QuickLink href="/admin/products/new">Add a product</QuickLink>
            <QuickLink href="/admin/categories">Manage categories</QuickLink>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex h-10 items-center gap-2 rounded-control border border-border px-4 text-[0.8125rem] transition-colors hover:bg-muted"
    >
      {children}
      <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Kpis({ stats, period }: { stats: AdminStats; period: string }) {
  const { current, previous } = stats;
  const kpis = [
    {
      label: "Revenue",
      value: formatPrice(current.revenue),
      change: change(current.revenue, previous.revenue),
    },
    {
      label: "Orders",
      value: count.format(current.orders),
      change: change(current.orders, previous.orders),
    },
    {
      label: "Average order",
      value: formatPrice(current.average_order_value),
      change: change(current.average_order_value, previous.average_order_value),
    },
    {
      label: "New customers",
      value: count.format(current.new_customers),
      change: change(current.new_customers, previous.new_customers),
      hint: `${count.format(stats.customers)} in all`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border xl:grid-cols-4">
      {kpis.map((kpi, i) => (
        <div
          key={kpi.label}
          className="animate-rise bg-card p-5 sm:p-6"
          style={{ "--i": i } as React.CSSProperties}
        >
          <p className="eyebrow">{kpi.label}</p>
          <p className="mt-4 truncate font-serif text-3xl tabular-nums sm:text-4xl">
            {kpi.value}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <ChangeChip change={kpi.change} period={period} />
            {kpi.hint && <span>{kpi.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeChip({ change, period }: { change: Change; period: string }) {
  const vs = `vs the ${period} before`;
  if (change.kind === "none") return <span>Nothing {vs}</span>;
  if (change.kind === "new") return <span>Up from none {vs}</span>;
  const Icon =
    change.kind === "up"
      ? ArrowUpRightIcon
      : change.kind === "down"
        ? ArrowDownRightIcon
        : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          change.kind === "up" && "text-success",
          change.kind === "down" && "text-destructive",
        )}
      >
        {Icon && <Icon weight="bold" className="size-3" />}
        <span className="sr-only">
          {change.kind === "up" ? "Up" : change.kind === "down" ? "Down" : ""}
        </span>
        {change.percent}%
      </span>
      {vs}
    </span>
  );
}

function NeedsAttention({
  attention,
}: {
  attention: AdminStats["needs_attention"];
}) {
  const rows = [
    {
      icon: TruckIcon,
      label: "Orders to ship",
      value: attention.to_ship,
      href: "/admin/orders?status=paid",
    },
    {
      icon: WarningIcon,
      label: "Paid orders short of stock",
      value: attention.oversold,
      href: "/admin/orders?status=paid",
      urgent: true,
    },
    {
      icon: EnvelopeSimpleIcon,
      label: "Emails that failed",
      value: attention.failed_emails,
      href: "/admin/emails?status=failed",
      urgent: true,
    },
    {
      icon: PackageIcon,
      label: "Variants sold out",
      value: attention.out_of_stock,
      href: "/admin/inventory?stock=out",
    },
  ];
  const clear = rows.every((r) => r.value === 0);

  return (
    <Panel title="Needs attention">
      {clear ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircleIcon weight="fill" className="size-4 text-success" />
          All clear. Nothing is waiting on you.
        </p>
      ) : (
        <ul className="-my-2 divide-y divide-border">
          {rows.map((row) => {
            const Icon = row.icon;
            const body = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      row.value > 0 && row.urgent
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate text-[0.8125rem]">{row.label}</span>
                </span>
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    row.value === 0 && "text-muted-foreground",
                    row.value > 0 && row.urgent && "text-destructive",
                  )}
                >
                  {count.format(row.value)}
                </span>
              </>
            );
            return (
              <li key={row.label}>
                {row.href && row.value > 0 ? (
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-3 py-2.5 hover:[&_span.truncate]:underline"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function TopProducts({
  products,
  label,
}: {
  products: AdminStats["top_products"];
  label: string;
}) {
  const max = Math.max(...products.map((p) => p.revenue), 1);
  return (
    <Panel title="Best sellers" hint={label}>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sales in this period.
        </p>
      ) : (
        <ol className="space-y-4">
          {products.map((p) => (
            <li key={p.product_id} className="flex items-center gap-3">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-media bg-muted">
                {p.image && (
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/admin/products/${p.product_id}`}
                    className="truncate text-[0.8125rem] hover:underline"
                  >
                    {p.product_name}
                  </Link>
                  <span className="shrink-0 text-[0.8125rem] tabular-nums">
                    {formatPrice(p.revenue)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${(p.revenue / max) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground tabular-nums">
                    {count.format(p.units)} sold
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const statusRows: { status: OrderStatus; label: string; bar: string }[] = [
  { status: "paid", label: "To ship", bar: "bg-foreground" },
  { status: "shipped", label: "Shipped", bar: "bg-clay" },
  { status: "delivered", label: "Delivered", bar: "bg-success" },
  {
    status: "pending",
    label: "Awaiting payment",
    bar: "bg-muted-foreground/40",
  },
  { status: "cancelled", label: "Cancelled", bar: "bg-muted-foreground/25" },
  { status: "refunded", label: "Refunded", bar: "bg-destructive/70" },
];

function OrdersByStatus({
  counts,
}: {
  counts: AdminStats["orders_by_status"];
}) {
  const total = statusRows.reduce((sum, r) => sum + counts[r.status], 0);
  return (
    <Panel title="Orders by status" hint={`${count.format(total)} in all`}>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <>
          {/* One bar of every order, split by status. */}
          <div className="mb-5 flex h-2 gap-px overflow-hidden rounded-full bg-muted">
            {statusRows.map(
              (r) =>
                counts[r.status] > 0 && (
                  <div
                    key={r.status}
                    className={r.bar}
                    style={{ width: `${(counts[r.status] / total) * 100}%` }}
                  />
                ),
            )}
          </div>
          <ul className="-my-1.5">
            {statusRows.map((r) => (
              <li key={r.status}>
                <Link
                  href={`/admin/orders?status=${r.status}`}
                  className="group flex items-center justify-between gap-3 py-1.5 text-[0.8125rem]"
                >
                  <span className="flex items-center gap-2.5">
                    <span className={cn("size-2 rounded-full", r.bar)} />
                    <span className="group-hover:underline">{r.label}</span>
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      counts[r.status] === 0 && "text-muted-foreground",
                    )}
                  >
                    {count.format(counts[r.status])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function RecentReviews({ reviews }: { reviews: AdminStats["recent_reviews"] }) {
  return (
    <Panel
      title="Latest reviews"
      action={
        <Link
          href="/admin/reviews"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          All reviews
        </Link>
      }
    >
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <ul className="-my-3 divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <Stars value={r.rating} size="size-3" />
                <span className="font-mono text-[0.625rem] text-muted-foreground">
                  {formatOrderDate(r.created_at)}
                </span>
              </div>
              <p className="mt-1.5 truncate text-[0.8125rem]">
                {r.title}
                {r.status === "hidden" && (
                  <span className="ml-2 font-mono text-[0.5625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    Hidden
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.author_name} on{" "}
                <Link
                  href={`/admin/products/${r.product_id}`}
                  className="hover:text-foreground hover:underline"
                >
                  {r.product_name}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentOrders({ orders }: { orders: AdminStats["recent_orders"] }) {
  return (
    <Panel
      title="Recent orders"
      action={
        <Link
          href="/admin/orders"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          All orders
        </Link>
      }
      className="overflow-hidden [&>div]:p-0"
    >
      {orders.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-border text-left">
                {["Order", "Customer", "Status", "Placed", "Total"].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "h-10 px-5 font-mono text-[0.625rem] font-normal tracking-[0.14em] text-muted-foreground uppercase",
                      h === "Total" && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="h-12 px-5 font-mono text-xs whitespace-nowrap">
                    <Link
                      href={`/admin/orders/${order.number}`}
                      className="hover:underline"
                    >
                      {orderLabel(order.number)}
                    </Link>
                  </td>
                  <td className="max-w-[14rem] truncate px-5">{order.email}</td>
                  <td className="px-5">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-5 text-muted-foreground">
                    {formatOrderDate(order.created_at)}
                  </td>
                  <td className="px-5 text-right tabular-nums">
                    {formatPrice(order.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** How many low-stock variants the dashboard lists; the rest are counted. */
const LOW_STOCK_SHOWN = 5;

function LowStock({ items }: { items: AdminStats["low_stock"] }) {
  const more = items.length - LOW_STOCK_SHOWN;
  return (
    <Panel
      title="Low stock"
      hint="5 or fewer"
      className="md:col-span-2 xl:col-span-1"
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every active variant has more than 5 in stock.
        </p>
      ) : (
        <ul className="-my-2 divide-y divide-border">
          {items.slice(0, LOW_STOCK_SHOWN).map((item) => (
            <li key={item.variant_id}>
              <Link
                href={`/admin/products/${item.product_id}#variants`}
                className="group flex items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] group-hover:underline">
                    {item.product_name}
                  </span>
                  <span className="block truncate font-mono text-[0.625rem] text-muted-foreground">
                    {item.sku ?? "No SKU"}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums",
                    item.stock === 0 ? "text-destructive" : "text-clay",
                  )}
                >
                  {item.stock === 0 && (
                    <WarningCircleIcon className="size-3.5" />
                  )}
                  {item.stock === 0 ? "Sold out" : `${item.stock} left`}
                </span>
              </Link>
            </li>
          ))}
          {more > 0 && (
            <li className="py-2.5 text-xs">
              <Link
                href="/admin/inventory"
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {/* The API sends 10 at most, so a full list may hide more. */}
                And {items.length === 10 ? "at least " : ""}
                {more} more in the inventory
              </Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading the dashboard"
    >
      <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-panel" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 rounded-panel" />
        <Skeleton className="h-96 rounded-panel" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-panel" />
        ))}
      </div>
    </div>
  );
}
