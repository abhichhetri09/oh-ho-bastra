"use client";

import { useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  HouseLineIcon,
  ReceiptIcon,
  TruckIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Order, OrderStatus } from "@repo/types";
import { cn } from "@/lib/utils";
import { formatShortDate } from "../lib/orders";

// An order's history as steps: what happened (with when), and for an order
// still on its way, what comes next. Two looks share it: a vertical
// timeline for the admin and a progress stepper for the customer.

type Dates = Pick<
  Order,
  | "status"
  | "created_at"
  | "paid_at"
  | "shipped_at"
  | "delivered_at"
  | "cancelled_at"
  | "refunded_at"
  | "tracking_number"
>;

type Step = "placed" | OrderStatus;

const STEP: Record<
  Exclude<Step, "pending">,
  {
    label: string;
    icon: Icon;
    tone: string;
    soft: string;
    at: (o: Dates) => string | null;
  }
> = {
  placed: {
    label: "Placed",
    icon: ReceiptIcon,
    tone: "bg-foreground text-background",
    soft: "bg-foreground/[0.07] text-foreground",
    at: (o) => o.created_at,
  },
  paid: {
    label: "Paid",
    icon: CreditCardIcon,
    tone: "bg-foreground text-background",
    soft: "bg-foreground/[0.07] text-foreground",
    at: (o) => o.paid_at,
  },
  shipped: {
    label: "Shipped",
    icon: TruckIcon,
    tone: "bg-clay text-clay-foreground",
    soft: "bg-clay/10 text-clay",
    at: (o) => o.shipped_at,
  },
  delivered: {
    label: "Delivered",
    icon: HouseLineIcon,
    tone: "bg-success text-white",
    soft: "bg-success/10 text-success",
    at: (o) => o.delivered_at,
  },
  cancelled: {
    label: "Cancelled",
    icon: XIcon,
    tone: "bg-muted-foreground text-background",
    soft: "bg-muted text-muted-foreground",
    at: (o) => o.cancelled_at,
  },
  refunded: {
    label: "Refunded",
    icon: ArrowCounterClockwiseIcon,
    tone: "bg-destructive text-white",
    soft: "bg-destructive/10 text-destructive",
    at: (o) => o.refunded_at,
  },
};

/** What comes after each status while the order is still on its way. */
const NEXT: Partial<
  Record<OrderStatus, Exclude<Step, "pending" | "placed">[]>
> = {
  pending: ["paid", "shipped", "delivered"],
  paid: ["shipped", "delivered"],
  shipped: ["delivered"],
};

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

/** The events that happened, oldest first. */
function events(order: Dates) {
  return (Object.keys(STEP) as (keyof typeof STEP)[])
    .map((step) => ({ step, time: STEP[step].at(order) }))
    .filter(
      (e): e is { step: keyof typeof STEP; time: string } => e.time !== null,
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * The admin's view: every step so far with its time, the latest one
 * highlighted, the ones still to come faded, and the tracking number under
 * Shipped.
 */
export function OrderTimeline({ order }: { order: Dates }) {
  const done = events(order);
  const upcoming = NEXT[order.status] ?? [];
  const rows = [
    ...done.map((e, i) => ({
      ...e,
      state: i === done.length - 1 ? "current" : "done",
    })),
    ...upcoming.map((step) => ({
      step,
      time: null,
      state: "upcoming" as const,
    })),
  ];

  return (
    <ol className="space-y-0">
      {rows.map((row, i) => {
        const s = STEP[row.step];
        const Icon = s.icon;
        const last = i === rows.length - 1;
        return (
          <li key={row.step} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-9 bottom-1 left-[15px] w-0.5 rounded-full",
                  row.state === "upcoming" || rows[i + 1]?.state === "upcoming"
                    ? "bg-[repeating-linear-gradient(to_bottom,var(--border)_0_4px,transparent_4px_8px)]"
                    : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                row.state === "current" &&
                  cn(s.tone, "shadow-sm ring-4 ring-foreground/[0.06]"),
                row.state === "done" && s.soft,
                row.state === "upcoming" &&
                  "border border-dashed border-border bg-background text-muted-foreground/60",
              )}
            >
              <Icon
                weight={row.state === "upcoming" ? "regular" : "bold"}
                className="size-3.5"
              />
            </span>
            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "text-[0.8125rem] leading-tight",
                  row.state === "upcoming"
                    ? "text-muted-foreground"
                    : "font-medium",
                )}
              >
                {s.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {row.time ? timeFormat.format(new Date(row.time)) : "Not yet"}
              </p>
              {row.step === "shipped" && row.time && order.tracking_number && (
                <TrackingNumber
                  value={order.tracking_number}
                  className="mt-2"
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const PROGRESS = ["paid", "shipped", "delivered"] as const;
const ADMIN_PROGRESS = ["placed", "paid", "shipped", "delivered"] as const;

/**
 * The customer's view of an order on its way: confirmed, shipped,
 * delivered, as a stepper whose track fills up as the order moves along.
 */
export function OrderProgress({
  order,
  admin = false,
}: {
  order: Dates;
  /** The admin's four steps (Placed, Paid…) instead of the customer's three. */
  admin?: boolean;
}) {
  const steps: readonly (keyof typeof STEP)[] = admin
    ? ADMIN_PROGRESS
    : PROGRESS;
  // An unpaid order is at "placed"; the customer's stepper doesn't show it.
  const at = steps.indexOf(
    order.status === "pending" ? "placed" : order.status,
  );
  return (
    <ol
      className={cn("grid", admin ? "grid-cols-4" : "grid-cols-3")}
      aria-label="Order progress"
    >
      {steps.map((step, i) => {
        const s = STEP[step];
        const Icon = s.icon;
        const reached = i <= at;
        const current = i === at;
        const time = s.at(order);
        return (
          <li
            key={step}
            className="relative flex flex-col items-center gap-2.5 text-center"
            aria-current={current ? "step" : undefined}
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute top-[1.125rem] left-[calc(50%+1.75rem)] h-[3px] w-[calc(100%-3.5rem)] overflow-hidden rounded-full bg-border"
              >
                <span
                  className={cn(
                    "block h-full rounded-full bg-foreground/70 transition-[width] duration-700 ease-out",
                    i < at ? "w-full" : "w-0",
                  )}
                />
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-colors duration-500",
                current &&
                  cn(s.tone, "shadow-sm ring-4 ring-foreground/[0.06]"),
                reached && !current && "bg-foreground text-background",
                !reached &&
                  "border border-dashed border-border bg-background text-muted-foreground/60",
              )}
            >
              {reached && !current ? (
                <CheckIcon weight="bold" className="size-4" />
              ) : (
                <Icon
                  weight={reached ? "bold" : "regular"}
                  className="size-4"
                />
              )}
            </span>
            <div>
              <p
                className={cn(
                  "text-xs",
                  reached
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step === "paid" && !admin ? "Confirmed" : s.label}
              </p>
              {time && (
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground tabular-nums">
                  {formatShortDate(time)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A tracking number in a soft chip, with a button that copies it. */
export function TrackingNumber({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface py-1 pr-1 pl-3 font-mono text-[0.6875rem]",
        className,
      )}
    >
      <span className="truncate select-all">{value}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        aria-label={copied ? "Copied" : "Copy tracking number"}
      >
        {copied ? (
          <CheckIcon weight="bold" className="size-3" />
        ) : (
          <CopyIcon className="size-3" />
        )}
      </button>
    </span>
  );
}
