"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  TruckIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { AdminOrderDetail, OrderStatus } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  adminCancelOrder,
  adminDeliverOrder,
  adminRefundOrder,
  adminShipOrder,
} from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import { countryName } from "@/modules/checkout/lib/countries";
import { formatOrderDate, orderLabel } from "@/modules/checkout/lib/orders";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminOrder } from "../queries";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { AdminPageHeader } from "./page-header";
import { BackLink } from "./page-back";
import { Panel } from "./panel";
import { OrderStatusBadge } from "./status-badge";

type Dialogs = "ship" | "deliver" | "cancel" | "refund" | null;

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // UTC like the order's other dates, so they agree around midnight.
  timeZone: "UTC",
  timeZoneName: "short",
});

/** One order as the shop sees it, with the next steps it can take. */
export function OrderDetailView({ number }: { number: number }) {
  const queryClient = useQueryClient();
  const order = useAdminOrder(number);
  const [open, setOpen] = useState<Dialogs>(null);
  const [tracking, setTracking] = useState("");
  const [restock, setRestock] = useState(true);

  const act = useAdminMutation({
    mutationFn: async (action: Exclude<Dialogs, null>) => {
      const path = { number };
      const opts = { path, throwOnError: true as const };
      const { data } =
        action === "ship"
          ? await adminShipOrder({
              ...opts,
              body: tracking.trim() ? { tracking_number: tracking.trim() } : {},
            })
          : action === "deliver"
            ? await adminDeliverOrder(opts)
            : action === "cancel"
              ? await adminCancelOrder(opts)
              : await adminRefundOrder({ ...opts, body: { restock } });
      return data.data;
    },
    success: (_, action) =>
      ({
        ship: "Marked as shipped",
        deliver: "Marked as delivered",
        cancel: "Order cancelled; its stock is back",
        refund: "Refunded in full",
      })[action],
    failure: "Couldn't update the order.",
    // Stock (cancel, refund) and revenue (refund) change too.
    invalidate: [
      adminKeys.orders(),
      adminKeys.stats(),
      adminKeys.products(),
      adminKeys.customers(),
      adminKeys.inventory(),
      adminKeys.counts(),
    ],
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.order(number), updated);
      setOpen(null);
    },
  });

  function run(action: Exclude<Dialogs, null>) {
    // A refused change (paid meanwhile, already shipped) means the page
    // is behind: close the dialog and show the order as it is now.
    act.mutate(action, {
      onError: () => {
        setOpen(null);
        void order.refetch();
      },
    });
  }

  if (order.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading the order">
        <BackLink href="/admin/orders">Orders</BackLink>
        <Skeleton className="mb-8 h-14 w-64" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-80" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (order.isError) {
    const code = getApiError(order.error)?.code;
    const missing =
      code === "ORDER_NOT_FOUND" || code === "INVALID_ORDER_NUMBER";
    return (
      <div>
        <BackLink href="/admin/orders">Orders</BackLink>
        <h1 className="display text-4xl">
          {missing ? "There's no such order." : "The order couldn't load."}
        </h1>
        {!missing && (
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => order.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  const o = order.data;
  const a = o.shipping_address;
  const items = o.items.reduce((n, item) => n + item.quantity, 0);
  const canShip = o.status === "paid";
  const canDeliver = o.status === "shipped";
  const canCancel = o.status === "pending";
  const canRefund = ["paid", "shipped", "delivered"].includes(o.status);

  return (
    <div>
      <BackLink href="/admin/orders">Orders</BackLink>
      <AdminPageHeader
        eyebrow="Order"
        title={orderLabel(o.number)}
        description={
          <span className="inline-flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={o.status} />
            <span>
              Placed {formatOrderDate(o.created_at)} · {items}{" "}
              {items === 1 ? "item" : "items"}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canShip && (
              <Button
                onClick={() => {
                  setTracking("");
                  setOpen("ship");
                }}
              >
                <TruckIcon data-icon="inline-start" />
                Mark shipped
              </Button>
            )}
            {canDeliver && (
              <Button onClick={() => setOpen("deliver")}>
                <CheckCircleIcon data-icon="inline-start" />
                Mark delivered
              </Button>
            )}
            {canCancel && (
              <Button variant="destructive" onClick={() => setOpen("cancel")}>
                <XCircleIcon data-icon="inline-start" />
                Cancel order
              </Button>
            )}
            {canRefund && (
              <Button
                variant="outline"
                onClick={() => {
                  // Stock goes back by default only if nothing left the shop.
                  setRestock(o.status === "paid");
                  setOpen("refund");
                }}
              >
                <ArrowCounterClockwiseIcon data-icon="inline-start" />
                Refund
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Panel title="Items" hint={String(items)} className="[&>div]:p-0">
          <ul className="divide-y divide-border">
            {o.items.map((item) => (
              <li key={item.id} className="flex gap-4 px-5 py-4">
                <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-media bg-surface">
                  {item.image && (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-[0.8125rem]">
                  {item.product_id ? (
                    <Link
                      href={`/admin/products/${item.product_id}`}
                      className="hover:underline"
                    >
                      {item.product_name}
                    </Link>
                  ) : (
                    <span>
                      {item.product_name}{" "}
                      <span className="text-xs text-muted-foreground">
                        (deleted)
                      </span>
                    </span>
                  )}
                  {item.options.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {optionSummary(item)}
                    </p>
                  )}
                  <p className="font-mono text-[0.625rem] text-muted-foreground">
                    {item.sku ?? "No SKU"}
                  </p>
                  {item.stock_shortfall > 0 && (
                    <p className="mt-1.5 inline-flex items-center gap-1 border border-destructive/40 px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.14em] text-destructive uppercase">
                      <WarningIcon className="size-3" />
                      {item.stock_shortfall} not in stock when paid
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[0.8125rem] tabular-nums">
                  <p>{formatPrice(item.line_total)}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatPrice(item.unit_price)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-border px-5 py-4 text-[0.8125rem]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatPrice(o.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">
                {o.shipping === 0 ? "Free" : formatPrice(o.shipping)}
              </dd>
            </div>
            <div className="flex justify-between pt-1 text-base">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(o.total)}</dd>
            </div>
          </dl>
        </Panel>

        <div className="space-y-6">
          <Panel title="Customer">
            <Link
              href={`/admin/customers/${o.customer.id}`}
              className="text-[0.8125rem] hover:underline"
            >
              {o.customer.name}
            </Link>
            <br />
            <a
              href={`mailto:${o.email}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {o.email}
            </a>
            <p className="eyebrow mt-5 mb-2">Ship to</p>
            <address className="text-[0.8125rem] leading-relaxed not-italic">
              {a.full_name}
              <br />
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
          </Panel>

          <Panel title="Payment">
            <Payment order={o} />
          </Panel>

          <Panel title="Timeline">
            <Timeline order={o} />
          </Panel>
        </div>
      </div>

      <Dialog
        open={open === "ship"}
        onOpenChange={(v) => !v && !act.isPending && setOpen(null)}
      >
        <DialogContent className="gap-6 p-6 sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("ship");
            }}
            className="grid gap-6"
          >
            <DialogHeader className="gap-2">
              <DialogTitle className="font-serif text-2xl font-normal">
                Mark {orderLabel(o.number)} shipped
              </DialogTitle>
              <DialogDescription className="text-[0.8125rem]">
                The customer sees it as shipped on their order page.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel
                htmlFor="tracking"
                className="eyebrow !text-foreground"
              >
                Tracking number
                <span className="ml-1 tracking-normal normal-case text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Input
                id="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                maxLength={64}
                autoComplete="off"
                className="font-mono"
              />
              <FieldDescription className="text-xs">
                Shown to the customer with the order.
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(null)}
                disabled={act.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={act.isPending}>
                {act.isPending ? "Saving…" : "Mark shipped"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={open === "deliver"}
        onOpenChange={(v) => !v && setOpen(null)}
        title={`Mark ${orderLabel(o.number)} delivered?`}
        description="For when the carrier confirms it arrived."
        confirmLabel="Mark delivered"
        pendingLabel="Saving…"
        tone="default"
        pending={act.isPending}
        onConfirm={() => run("deliver")}
      />

      <ConfirmDialog
        open={open === "cancel"}
        onOpenChange={(v) => !v && setOpen(null)}
        title={`Cancel ${orderLabel(o.number)}?`}
        description="Its checkout page stops working, so it can't be paid any more, and the stock it was holding goes back on sale."
        confirmLabel="Cancel order"
        pendingLabel="Cancelling…"
        pending={act.isPending}
        onConfirm={() => run("cancel")}
      />

      <ConfirmDialog
        open={open === "refund"}
        onOpenChange={(v) => !v && setOpen(null)}
        title={`Refund ${formatPrice(o.total)}?`}
        description={`The full amount of ${orderLabel(o.number)} goes back to the customer's card through Stripe. This can't be undone.`}
        confirmLabel="Refund in full"
        pendingLabel="Refunding…"
        pending={act.isPending}
        onConfirm={() => run("refund")}
      >
        <Field
          orientation="horizontal"
          className="items-start justify-between gap-4 rounded-panel border border-border p-4"
        >
          <div className="space-y-1">
            <FieldLabel htmlFor="restock" className="text-[0.8125rem]">
              Return the items to stock
            </FieldLabel>
            <FieldDescription className="text-xs">
              {o.status === "paid"
                ? "Nothing has shipped, so they can be sold again."
                : "Only if the items came back and can be sold again."}
            </FieldDescription>
          </div>
          <Switch id="restock" checked={restock} onCheckedChange={setRestock} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function Payment({ order }: { order: AdminOrderDetail }) {
  const p = order.payment;
  if (!p) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground">
        {order.status === "pending"
          ? "Not paid yet: the customer is at checkout."
          : "No payment was taken."}
      </p>
    );
  }
  return (
    <dl className="space-y-3 text-[0.8125rem]">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Paid</dt>
        <dd className="tabular-nums">{formatPrice(p.amount)}</dd>
      </div>
      {p.stripe_payment_intent_id && (
        <div className="space-y-1">
          <dt className="text-muted-foreground">Stripe payment</dt>
          <dd className="font-mono text-[0.6875rem] break-all select-all">
            {p.stripe_payment_intent_id}
          </dd>
        </div>
      )}
      {p.stripe_refund_id && (
        <div className="space-y-1">
          <dt className="text-muted-foreground">Refund</dt>
          <dd className="font-mono text-[0.6875rem] break-all select-all">
            {p.stripe_refund_id}
          </dd>
        </div>
      )}
    </dl>
  );
}

const steps: {
  status: OrderStatus | "placed";
  label: string;
  at: (o: AdminOrderDetail) => string | null;
}[] = [
  { status: "placed", label: "Placed", at: (o) => o.created_at },
  { status: "paid", label: "Paid", at: (o) => o.paid_at },
  { status: "shipped", label: "Shipped", at: (o) => o.shipped_at },
  { status: "delivered", label: "Delivered", at: (o) => o.delivered_at },
  { status: "cancelled", label: "Cancelled", at: (o) => o.cancelled_at },
  { status: "refunded", label: "Refunded", at: (o) => o.refunded_at },
];

/** What happened to the order, oldest first. */
function Timeline({ order }: { order: AdminOrderDetail }) {
  const events = steps
    .map((s) => ({ ...s, time: s.at(order) }))
    .filter((e): e is typeof e & { time: string } => e.time !== null)
    .sort((x, y) => x.time.localeCompare(y.time));
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e, i) => (
        <li key={e.status} className="relative text-[0.8125rem]">
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background",
              i === events.length - 1
                ? "bg-foreground"
                : "bg-muted-foreground/40",
            )}
          />
          <p>{e.label}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {timeFormat.format(new Date(e.time))}
          </p>
          {e.status === "shipped" && order.tracking_number && (
            <p className="mt-1 font-mono text-[0.6875rem] break-all select-all">
              {order.tracking_number}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
