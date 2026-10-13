import type { Order, OrderStatus } from "@repo/types";

/** "OHB-1042" */
export function orderLabel(number: number): string {
  return `OHB-${number}`;
}

/**
 * The order number in a URL segment: "1042", or the label "OHB-1042" (any
 * case) someone pasted. Null for anything else, including 0.
 */
export function parseOrderNumber(raw: string): number | null {
  const match = /^(?:ohb-)?(\d{1,15})$/i.exec(raw.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 ? number : null;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** The steps of a fulfilled order, in order. */
export const TIMELINE: OrderStatus[] = ["paid", "shipped", "delivered"];

/**
 * How far along the timeline an order is: the index of its step, or -1
 * for an order that left it (pending, cancelled, refunded).
 */
export function timelineStep(status: OrderStatus): number {
  return TIMELINE.indexOf(status);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "10 October 2026", in UTC so the server and browser agree. */
export function formatOrderDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** When an order reached a step of the timeline, if it has. */
export function stepDate(
  order: Pick<Order, "paid_at" | "shipped_at" | "delivered_at">,
  step: OrderStatus,
): string | null {
  switch (step) {
    case "paid":
      return order.paid_at;
    case "shipped":
      return order.shipped_at;
    case "delivered":
      return order.delivered_at;
    default:
      return null;
  }
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "12 Oct", in UTC like formatOrderDate. */
export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}
