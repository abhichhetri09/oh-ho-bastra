"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  EnvelopeSimpleIcon,
  HouseLineIcon,
  MapPinIcon,
  PackageIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  TruckIcon,
  WarningIcon,
  XCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { AdminOrderDetail } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  adminCancelOrder,
  adminDeliverOrder,
  adminRefundOrder,
  adminSetOrderTracking,
  adminShipOrder,
} from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { optionSummary } from "@/modules/cart/lib/cart-math";
import {
  OrderProgress,
  OrderTimeline,
  TrackingNumber,
} from "@/modules/checkout/components/order-timeline";
import { countryName } from "@/modules/checkout/lib/countries";
import { formatOrderDate, orderLabel } from "@/modules/checkout/lib/orders";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminOrder } from "../queries";
import { BackLink } from "./page-back";
import { Panel } from "./panel";
import { OrderStatusBadge } from "./status-badge";

type Action = "ship" | "deliver" | "cancel" | "refund";
type Confirm = Exclude<Action, "ship"> | null;

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // UTC like the order's other dates, so they agree around midnight.
  timeZone: "UTC",
  timeZoneName: "short",
});

/**
 * One order as the shop sees it. The card at the top says where the order
 * is and offers its next step (ship it, mark it delivered…); below are the
 * items and what happened, and beside them the customer, the address and
 * the payment.
 */
export function OrderDetailView({ number }: { number: number }) {
  const queryClient = useQueryClient();
  const order = useAdminOrder(number);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [tracking, setTracking] = useState("");
  const [restock, setRestock] = useState(true);

  const act = useAdminMutation({
    mutationFn: async (action: Action) => {
      const opts = { path: { number }, throwOnError: true as const };
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
        ship: "Marked as shipped; the customer is emailed",
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
      setConfirm(null);
      setTracking("");
    },
  });

  function run(action: Action) {
    // A refused change (paid meanwhile, already shipped) means the page
    // is behind: close the dialog and show the order as it is now.
    act.mutate(action, {
      onError: () => {
        setConfirm(null);
        void order.refetch();
      },
    });
  }

  if (order.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading the order">
        <BackLink href="/admin/orders">Orders</BackLink>
        <Skeleton className="mb-6 h-14 w-64" />
        <Skeleton className="mb-6 h-48 rounded-panel" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-80 rounded-panel" />
          <Skeleton className="h-96 rounded-panel" />
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
  const items = o.items.reduce((n, item) => n + item.quantity, 0);
  const canCancel = o.status === "pending";
  const canRefund = ["paid", "shipped", "delivered"].includes(o.status);

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/orders">Orders</BackLink>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display text-5xl">{orderLabel(o.number)}</h1>
              <OrderStatusBadge status={o.status} />
            </div>
            <p className="text-[0.8125rem] text-muted-foreground">
              Placed {formatOrderDate(o.created_at)} · {items}{" "}
              {items === 1 ? "item" : "items"} ·{" "}
              <span className="text-foreground tabular-nums">
                {formatPrice(o.total)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button variant="outline" onClick={() => setConfirm("cancel")}>
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
                  setConfirm("refund");
                }}
              >
                <ArrowCounterClockwiseIcon data-icon="inline-start" />
                Refund
              </Button>
            )}
          </div>
        </header>
      </div>

      <section className="space-y-6 rounded-panel border border-border bg-card p-6">
        {o.status !== "cancelled" && o.status !== "refunded" && (
          <OrderProgress order={o} admin />
        )}
        <NextStep
          order={o}
          items={items}
          tracking={tracking}
          setTracking={setTracking}
          pending={act.isPending}
          onShip={() => run("ship")}
          onDeliver={() => setConfirm("deliver")}
          onCancel={() => setConfirm("cancel")}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <Items order={o} items={items} />
          <Panel title="Activity">
            <OrderTimeline order={o} />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Customer order={o} />
          <ShipTo order={o} />
          <Payment order={o} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === "deliver"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Mark ${orderLabel(o.number)} delivered?`}
        description="For when the carrier confirms it arrived."
        confirmLabel="Mark delivered"
        pendingLabel="Saving…"
        tone="default"
        pending={act.isPending}
        onConfirm={() => run("deliver")}
      />

      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Cancel ${orderLabel(o.number)}?`}
        description="Its checkout page stops working, so it can't be paid any more, and the stock it was holding goes back on sale."
        confirmLabel="Cancel order"
        pendingLabel="Cancelling…"
        pending={act.isPending}
        onConfirm={() => run("cancel")}
      />

      <ConfirmDialog
        open={confirm === "refund"}
        onOpenChange={(v) => !v && setConfirm(null)}
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

/** A soft rounded tile with an icon, a title and a line under it. */
function Callout({
  icon: Icon,
  tone,
  title,
  children,
  aside,
}: {
  icon: Icon;
  tone: string;
  title: string;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-panel bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full bg-background",
            tone,
          )}
        >
          <Icon weight="bold" className="size-4.5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-medium">{title}</p>
          {children && (
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {children}
            </div>
          )}
        </div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** Where the order is now, and the step it's waiting for. */
function NextStep({
  order: o,
  items,
  tracking,
  setTracking,
  pending,
  onShip,
  onDeliver,
  onCancel,
}: {
  order: AdminOrderDetail;
  items: number;
  tracking: string;
  setTracking: (v: string) => void;
  pending: boolean;
  onShip: () => void;
  onDeliver: () => void;
  onCancel: () => void;
}) {
  switch (o.status) {
    case "pending":
      return (
        <Callout
          icon={ClockIcon}
          tone="text-muted-foreground"
          title="Waiting for payment"
          aside={
            <Button variant="outline" onClick={onCancel}>
              <XCircleIcon data-icon="inline-start" />
              Cancel order
            </Button>
          }
        >
          The customer is at checkout. The page expires{" "}
          {timeFormat.format(new Date(o.expires_at))}, and the stock it holds
          goes back on sale then.
        </Callout>
      );
    case "paid":
      return (
        <div className="space-y-4 rounded-panel bg-surface p-4 sm:p-5">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-clay">
              <PackageIcon weight="bold" className="size-4.5" />
            </span>
            <div className="pt-0.5">
              <p className="text-sm font-medium">Ready to ship</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Pack {items} {items === 1 ? "item" : "items"} for{" "}
                {o.shipping_address.full_name}. Add the carrier&apos;s tracking
                number so the customer can follow the parcel; they&apos;re
                emailed when it ships.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onShip();
            }}
            className="flex flex-col gap-2 sm:flex-row sm:pl-13.5"
          >
            <Input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              maxLength={64}
              autoComplete="off"
              placeholder="Tracking number (optional)"
              aria-label="Tracking number"
              className="h-10 bg-background font-mono sm:max-w-xs"
              disabled={pending}
            />
            <Button type="submit" disabled={pending}>
              <TruckIcon data-icon="inline-start" />
              {pending ? "Saving…" : "Mark shipped"}
            </Button>
          </form>
        </div>
      );
    case "shipped":
      return (
        <Callout
          icon={TruckIcon}
          tone="text-clay"
          title={`On its way since ${formatOrderDate(o.shipped_at ?? o.created_at)}`}
          aside={
            <Button onClick={onDeliver}>
              <CheckCircleIcon data-icon="inline-start" />
              Mark delivered
            </Button>
          }
        >
          <TrackingEditor order={o} />
        </Callout>
      );
    case "delivered":
      return (
        <Callout
          icon={HouseLineIcon}
          tone="text-success"
          title={`Delivered on ${formatOrderDate(o.delivered_at ?? o.created_at)}`}
        >
          <TrackingEditor order={o} />
        </Callout>
      );
    case "cancelled":
      return (
        <Callout
          icon={XCircleIcon}
          tone="text-muted-foreground"
          title={`Cancelled${o.cancelled_at ? ` on ${formatOrderDate(o.cancelled_at)}` : ""}`}
        >
          It was never paid, so nothing was charged, and its stock went back on
          sale.
        </Callout>
      );
    case "refunded":
      return (
        <Callout
          icon={ArrowCounterClockwiseIcon}
          tone="text-destructive"
          title={`Refunded${o.refunded_at ? ` on ${formatOrderDate(o.refunded_at)}` : ""}`}
        >
          {formatPrice(o.total)} went back to the customer&apos;s card through
          Stripe.
        </Callout>
      );
  }
}

/**
 * The tracking number of a shipped or delivered order, which the customer
 * sees on their order page: shown with copy, and editable in place (empty
 * removes it).
 */
function TrackingEditor({ order }: { order: AdminOrderDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const save = useAdminMutation({
    mutationFn: async (tracking: string) => {
      const { data } = await adminSetOrderTracking({
        path: { number: order.number },
        body: { tracking_number: tracking },
        throwOnError: true,
      });
      return data.data;
    },
    success: (updated) =>
      updated.tracking_number
        ? "Tracking number saved; the customer can see it"
        : "Tracking number removed",
    failure: "Couldn't save the tracking number.",
    invalidate: [adminKeys.orders()],
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.order(order.number), updated);
      setEditing(false);
    },
  });

  const start = () => {
    setValue(order.tracking_number ?? "");
    setEditing(true);
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(value.trim());
        }}
        className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={64}
          autoFocus
          autoComplete="off"
          placeholder="e.g. JJFI60123456789"
          aria-label="Tracking number"
          className="h-9 bg-background font-mono sm:w-64"
          disabled={save.isPending}
        />
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={
              save.isPending || value.trim() === (order.tracking_number ?? "")
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (!order.tracking_number) {
    return (
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        No tracking number yet, so the customer can&apos;t follow the parcel.
        <Button variant="outline" size="xs" onClick={start}>
          <PlusIcon data-icon="inline-start" />
          Add tracking number
        </Button>
      </span>
    );
  }

  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <TrackingNumber value={order.tracking_number} className="bg-background" />
      <Button variant="ghost" size="xs" onClick={start}>
        <PencilSimpleIcon data-icon="inline-start" />
        Edit
      </Button>
    </span>
  );
}

/** The lines of the order with its totals. */
function Items({
  order: o,
  items,
}: {
  order: AdminOrderDetail;
  items: number;
}) {
  return (
    <Panel title="Items" hint={String(items)} className="[&>div]:p-0">
      <ul className="divide-y divide-border">
        {o.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 px-5 py-4">
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
              {item.quantity > 1 && (
                <span className="absolute top-0 right-0 flex h-5 min-w-5 items-center justify-center rounded-bl-[0.5rem] bg-foreground px-1 text-[0.625rem] font-medium text-background tabular-nums">
                  {item.quantity}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-[0.8125rem]">
              {item.product_id ? (
                <Link
                  href={`/admin/products/${item.product_id}`}
                  className="font-medium hover:underline"
                >
                  {item.product_name}
                </Link>
              ) : (
                <span className="font-medium">
                  {item.product_name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (deleted)
                  </span>
                </span>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {item.options.length > 0 && <span>{optionSummary(item)}</span>}
                <span className="font-mono text-[0.625rem]">
                  {item.sku ?? "No SKU"}
                </span>
              </p>
              {item.stock_shortfall > 0 && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.6875rem] text-destructive">
                  <WarningIcon className="size-3" />
                  {item.stock_shortfall} not in stock when paid
                </p>
              )}
            </div>
            <div className="shrink-0 text-right text-[0.8125rem] tabular-nums">
              <p className="font-medium">{formatPrice(item.line_total)}</p>
              <p className="text-xs text-muted-foreground">
                {item.quantity} × {formatPrice(item.unit_price)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 rounded-b-panel bg-surface/60 px-5 py-4 text-[0.8125rem]">
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
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <dt className="font-medium">Total</dt>
          <dd className="text-lg font-medium tabular-nums">
            {formatPrice(o.total)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Who ordered, with a way to reach them and their other orders. */
function Customer({ order: o }: { order: AdminOrderDetail }) {
  return (
    <Panel title="Customer">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-clay/10 text-[0.8125rem] font-medium text-clay">
          {initials(o.customer.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium">
            {o.customer.name}
          </p>
          <a
            href={`mailto:${o.email}`}
            className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
          >
            <EnvelopeSimpleIcon className="size-3 shrink-0" />
            {o.email}
          </a>
        </div>
      </div>
      <Link
        href={`/admin/customers/${o.customer.id}`}
        className="mt-4 flex items-center justify-between rounded-control bg-surface px-3 py-2 text-xs transition-colors hover:bg-muted"
      >
        Profile and other orders
        <ArrowRightIcon className="size-3.5" />
      </Link>
    </Panel>
  );
}

/** The shipping address, ready to copy onto a label. */
function ShipTo({ order: o }: { order: AdminOrderDetail }) {
  const a = o.shipping_address;
  const lines = [
    a.full_name,
    [a.line1, a.line2].filter(Boolean).join(", "),
    [`${a.city}${a.region ? `, ${a.region}` : ""}`, a.postal_code].join(" "),
    countryName(a.country),
  ];
  return (
    <Panel
      title="Ship to"
      action={
        <CopyButton value={lines.join("\n")} label="the shipping address" />
      }
    >
      <div className="flex gap-3">
        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <address className="text-[0.8125rem] leading-relaxed not-italic">
          {lines.map((line, i) => (
            <span key={i} className={cn("block", i === 0 && "font-medium")}>
              {line}
            </span>
          ))}
        </address>
      </div>
      {a.phone && (
        <a
          href={`tel:${a.phone}`}
          className="mt-3 flex items-center gap-3 text-[0.8125rem] text-muted-foreground hover:text-foreground"
        >
          <PhoneIcon className="size-4 shrink-0" />
          {a.phone}
        </a>
      )}
    </Panel>
  );
}

/** What was paid through Stripe, and any refund. */
function Payment({ order }: { order: AdminOrderDetail }) {
  const p = order.payment;
  return (
    <Panel title="Payment">
      {!p ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          {order.status === "pending"
            ? "Not paid yet: the customer is at checkout."
            : "No payment was taken."}
        </p>
      ) : (
        <div className="space-y-4 text-[0.8125rem]">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
              <CreditCardIcon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {formatPrice(p.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.refunded_at
                  ? `Refunded ${formatOrderDate(p.refunded_at)}`
                  : `Paid by card, ${formatOrderDate(p.created_at)}`}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                p.refunded_at
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success/10 text-success",
              )}
            >
              {p.refunded_at ? "Refunded" : "Paid"}
            </span>
          </div>
          {[
            ["Stripe payment", p.stripe_payment_intent_id],
            ["Refund", p.stripe_refund_id],
          ]
            .filter((row): row is [string, string] => Boolean(row[1]))
            .map(([label, id]) => (
              <div key={label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="flex items-center gap-1 rounded-control bg-surface py-1 pr-1 pl-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] select-all">
                    {id}
                  </span>
                  <CopyButton
                    value={id}
                    label={`the ${label.toLowerCase()} id`}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
    </Panel>
  );
}
