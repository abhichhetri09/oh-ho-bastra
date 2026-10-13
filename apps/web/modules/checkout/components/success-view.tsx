"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { m } from "motion/react";
import type { OrderDetail } from "@repo/types";
import { EmptyState } from "@/components/feedback/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/money";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { cartKeys } from "@/modules/cart/keys";
import { countryName } from "../lib/countries";
import { orderLabel } from "../lib/orders";
import { orderKeys } from "../keys";
import { CONFIRM_TIMEOUT, useCheckoutSession } from "../queries";

/**
 * Where Stripe sends the shopper back. It polls until the payment is
 * confirmed, then celebrates and refreshes the bag (the bought lines left
 * it server-side) and the order history.
 */
export function SuccessView({ sessionId }: { sessionId: string }) {
  const [startedAt] = useState(() => Date.now());
  const query = useCheckoutSession(sessionId, startedAt);
  const queryClient = useQueryClient();
  const order = query.data;
  const paid =
    order !== undefined &&
    order.status !== "pending" &&
    order.status !== "cancelled";

  useEffect(() => {
    if (!paid) return;
    void queryClient.invalidateQueries({ queryKey: cartKeys.all });
    void queryClient.invalidateQueries({
      queryKey: orderKeys.all,
      refetchType: "none",
    });
  }, [paid, queryClient]);

  if (!sessionId || (query.isError && !order)) {
    return (
      <EmptyState
        eyebrow="Order not found"
        title="We couldn't find this checkout."
        action={
          <Link href="/account/orders" className={buttonVariants()}>
            Your orders
          </Link>
        }
      >
        If you paid, your order is safe: it appears in your orders as soon as
        the payment is confirmed.
      </EmptyState>
    );
  }

  if (!order || order.status === "pending") {
    const slow =
      order !== undefined && Date.now() - startedAt >= CONFIRM_TIMEOUT;
    return (
      <div
        className="flex flex-col items-center gap-6 py-32 text-center"
        aria-live="polite"
      >
        <span className="relative flex size-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-foreground/10" />
          <span className="size-3 rounded-full bg-foreground" />
        </span>
        <p className="display text-4xl">
          {slow ? "Still confirming…" : "Confirming your payment…"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {slow
            ? "This is taking longer than usual. You can leave this page: your order will appear in your account once the payment lands."
            : "This only takes a moment. Please keep this page open."}
        </p>
        {slow && (
          <Link
            href="/account/orders"
            className={buttonVariants({ variant: "outline" })}
          >
            Go to your orders
          </Link>
        )}
      </div>
    );
  }

  if (order.status === "cancelled") {
    return (
      <EmptyState
        eyebrow={orderLabel(order.number)}
        title="This checkout expired."
        action={
          <Link href="/cart" className={buttonVariants()}>
            Back to your bag
          </Link>
        }
      >
        Nothing was charged. Your bag is just as you left it.
      </EmptyState>
    );
  }

  return <Confirmation order={order} />;
}

function Confirmation({ order }: { order: OrderDetail }) {
  const a = order.shipping_address;
  return (
    <div className="mx-auto grid max-w-5xl gap-14 py-12 lg:grid-cols-[1fr_22rem] lg:py-20">
      <div className="space-y-8">
        <DrawnCheck />
        <div className="space-y-4">
          <p className="eyebrow animate-rise">
            Order {orderLabel(order.number)}
          </p>
          <h1
            className="display animate-rise text-[clamp(3rem,6vw,5rem)]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Thank you, <em>{a.full_name.split(" ")[0]}.</em>
          </h1>
          <p
            className="animate-rise max-w-md text-sm leading-relaxed text-muted-foreground"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Your order is confirmed and we&apos;re getting it ready. A receipt
            is on its way to {order.email}.
          </p>
        </div>
        <div
          className="animate-rise flex flex-wrap gap-3"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <Link
            href={`/account/orders/${order.number}`}
            className={buttonVariants()}
          >
            View order
          </Link>
          <Link href="/shop" className={buttonVariants({ variant: "outline" })}>
            Keep shopping
          </Link>
        </div>
        <div className="grid gap-6 border-t border-border pt-8 text-sm sm:grid-cols-2">
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
          <div>
            <p className="eyebrow mb-2">Delivery</p>
            <p>Standard, 2–4 working days</p>
          </div>
        </div>
      </div>

      <aside className="h-fit space-y-5 rounded-panel border border-border bg-surface/60 p-6">
        <p className="eyebrow">Summary</p>
        <ul className="space-y-4">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3 text-sm">
              <div className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-media bg-background">
                {item.image && (
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  Qty {item.quantity}
                </p>
              </div>
              <p className="tabular-nums">{formatPrice(item.line_total)}</p>
            </li>
          ))}
        </ul>
        <OrderTotals order={order} />
      </aside>
    </div>
  );
}

export function OrderTotals({
  order,
  className,
}: {
  order: OrderDetail;
  className?: string;
}) {
  return (
    <dl
      className={cn("space-y-2 border-t border-border pt-4 text-sm", className)}
    >
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Shipping</dt>
        <dd className="tabular-nums">
          {order.shipping === 0 ? "Free" : formatPrice(order.shipping)}
        </dd>
      </div>
      <div className="flex justify-between pt-1 text-base">
        <dt>Total paid</dt>
        <dd className="tabular-nums">{formatPrice(order.total)}</dd>
      </div>
    </dl>
  );
}

/** A circle and tick that draw themselves once. */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 52 52" className="size-16 text-success" aria-hidden>
      <m.circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      />
      <m.path
        d="M15 27 l7 7 l15 -16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.6, ease: EASE_OUT }}
      />
    </svg>
  );
}
