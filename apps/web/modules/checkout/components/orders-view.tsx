"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import type { OrderStatus } from "@repo/types";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/hooks/use-in-view";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import { countryName } from "../lib/countries";
import {
  formatOrderDate,
  orderLabel,
  STATUS_LABELS,
  TIMELINE,
  formatShortDate,
  stepDate,
  timelineStep,
} from "../lib/orders";
import { useOrder, useOrders } from "../queries";
import { OrderTotals } from "./success-view";

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem]",
        status === "cancelled" || status === "refunded"
          ? "border-border text-muted-foreground"
          : "border-foreground/20",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "delivered" || status === "paid"
            ? "bg-success"
            : status === "shipped"
              ? "bg-clay"
              : "bg-muted-foreground",
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Order history: 10 at a time, loading more as the list nears its end. */
export function OrdersView() {
  const query = useOrders();
  const [sentinelRef, nearEnd] = useInView<HTMLDivElement>("600px");
  const orders = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;
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
        <h1 className="display animate-rise text-5xl">Orders.</h1>
        {total > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {total} {total === 1 ? "order" : "orders"}
          </p>
        )}
      </header>

      {query.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : query.isError && !query.data ? (
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your orders."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          eyebrow="No orders yet"
          title="When you order, it shows up here."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border border-y border-border">
            {orders.map((order, i) => (
              <li
                key={order.id}
                className="animate-rise"
                style={{ "--i": i % 10 } as React.CSSProperties}
              >
                <Link
                  href={`/account/orders/${order.number}`}
                  className="group grid grid-cols-[auto_1fr_auto] items-center gap-5 py-5"
                >
                  <div className="flex -space-x-4">
                    {order.preview_images.map((src) => (
                      <div
                        key={src}
                        className="relative aspect-[4/5] w-12 overflow-hidden rounded-media border-2 border-background bg-surface"
                      >
                        <Image
                          src={src}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs">
                        {orderLabel(order.number)}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatOrderDate(order.created_at)} · {order.item_count}{" "}
                      {order.item_count === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">
                      {formatPrice(order.total)}
                    </span>
                    <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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

/** One order: where it is, what's in it and where it's going. */
export function OrderView({ number }: { number: number }) {
  const query = useOrder(number);
  const order = query.data;

  if (query.isPending) {
    return <Skeleton className="h-96" />;
  }
  // Only "no such order" is final; anything else (a network blip) may pass.
  const code = getApiError(query.error)?.code;
  if (!order && code !== "ORDER_NOT_FOUND" && code !== "INVALID_ORDER_NUMBER") {
    return (
      <EmptyState
        eyebrow="Something went wrong"
        title="We couldn't load this order."
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!order) {
    return (
      <EmptyState
        eyebrow="Order not found"
        title="We couldn't find that order."
        action={
          <Link href="/account/orders" className={buttonVariants()}>
            Your orders
          </Link>
        }
      />
    );
  }

  const step = timelineStep(order.status);
  // Paid (or later) orders make their buyer a verified reviewer.
  const reviewable = step >= 0;
  const reviewed = new Set(order.reviewed_product_ids);
  const a = order.shipping_address;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Link
          href="/account/orders"
          className="link-underline text-xs text-muted-foreground hover:text-foreground"
        >
          All orders
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="display text-5xl">{orderLabel(order.number)}</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Placed {formatOrderDate(order.created_at)}
        </p>
      </header>

      {step >= 0 ? (
        <ol className="grid grid-cols-3 gap-2" aria-label="Order progress">
          {TIMELINE.map((status, i) => (
            <li key={status} className="space-y-2">
              <div
                className={cn(
                  "h-0.5 transition-colors duration-700",
                  i <= step ? "bg-foreground" : "bg-border",
                )}
              />
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  i <= step ? "text-foreground" : "text-muted-foreground",
                )}
                aria-current={i === step ? "step" : undefined}
              >
                {i <= step && <CheckIcon weight="bold" className="size-3" />}
                {STATUS_LABELS[status]}
              </p>
              <StepDate iso={stepDate(order, status)} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-panel border border-border p-4 text-sm text-muted-foreground">
          {order.status === "cancelled"
            ? "This order was cancelled before payment. Nothing was charged."
            : order.status === "refunded"
              ? `This order was refunded${order.refunded_at ? ` on ${formatOrderDate(order.refunded_at)}` : ""}. The money goes back to the card it was paid with.`
              : "Waiting for payment to be confirmed."}
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
        <ul className="divide-y divide-border border-y border-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4">
              <div className="relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-media bg-surface">
                {item.image && (
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {item.product_id ? (
                  <Link
                    href={`/products/${item.product_slug}`}
                    className="link-underline"
                  >
                    {item.product_name}
                  </Link>
                ) : (
                  <p>{item.product_name}</p>
                )}
                {item.options.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {optionSummary(item)}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {item.quantity} × {formatPrice(item.unit_price)}
                </p>
                {reviewable &&
                  item.product_id &&
                  (reviewed.has(item.product_id) ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckIcon weight="bold" className="size-3" />
                      Reviewed
                      <span aria-hidden>·</span>
                      <Link
                        href={`/products/${item.product_slug}?review=1#reviews`}
                        className="link-underline text-foreground"
                      >
                        Edit
                        <span className="sr-only">
                          {" "}
                          your review of {item.product_name}
                        </span>
                      </Link>
                    </p>
                  ) : (
                    <Link
                      href={`/products/${item.product_slug}?review=1#reviews`}
                      className="link-underline mt-2 inline-block text-xs"
                    >
                      Write a review
                      <span className="sr-only"> of {item.product_name}</span>
                    </Link>
                  ))}
              </div>
              <p className="text-sm tabular-nums">
                {formatPrice(item.line_total)}
              </p>
            </li>
          ))}
        </ul>

        <aside className="space-y-6 text-sm">
          <div>
            <p className="eyebrow mb-2">Shipping to</p>
            <p>{a.full_name}</p>
            <p className="text-muted-foreground">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}
              <br />
              {a.city}
              {a.region ? `, ${a.region}` : ""} {a.postal_code}
              <br />
              {countryName(a.country)}
            </p>
          </div>
          {order.tracking_number && (
            <div>
              <p className="eyebrow mb-2">Tracking number</p>
              <p className="font-mono text-xs break-all select-all">
                {order.tracking_number}
              </p>
            </div>
          )}
          <OrderTotals order={order} />
        </aside>
      </div>
    </div>
  );
}

function StepDate({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return (
    <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
      {formatShortDate(iso)}
    </p>
  );
}
