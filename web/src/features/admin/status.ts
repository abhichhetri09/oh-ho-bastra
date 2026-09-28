import {
  Ban,
  CircleCheck,
  Clock,
  CreditCard,
  StickyNote,
  Truck,
  type LucideIcon,
} from "@/components/icons";
import type { Tone } from "@/components/ui/status-pill";
import { orderStatusLabels, type OrderStatus } from "@/features/orders/types";
import { formatDate } from "@/lib/format";
import type { AdminUserRow, OrderEventType } from "./types";

export const orderStatusTone: Record<OrderStatus, Tone> = {
  pending_payment: "warning",
  paid: "info",
  fulfilled: "success",
  cancelled: "neutral",
};

/** Admin wording: a paid order is one that still needs shipping. */
export const adminOrderLabels: Record<OrderStatus, string> = {
  ...orderStatusLabels,
  paid: "To ship",
};

export function userStatus(user: Pick<AdminUserRow, "banned" | "banExpires">): { tone: Tone; label: string } {
  if (!user.banned) return { tone: "success", label: "Active" };
  return {
    tone: "danger",
    label: user.banExpires ? `Banned until ${formatDate(user.banExpires)}` : "Banned",
  };
}

export const eventStyle: Record<OrderEventType, { icon: LucideIcon; label: string; tone: Tone }> = {
  created: { icon: Clock, label: "Order placed", tone: "neutral" },
  paid: { icon: CreditCard, label: "Payment received", tone: "info" },
  payment_failed: { icon: Ban, label: "Payment declined", tone: "danger" },
  payment_cancelled: { icon: Ban, label: "Payment cancelled", tone: "warning" },
  fulfilled: { icon: Truck, label: "Shipped", tone: "success" },
  cancelled: { icon: Ban, label: "Order cancelled", tone: "danger" },
  note: { icon: StickyNote, label: "Note", tone: "neutral" },
  tracking_updated: { icon: Truck, label: "Tracking updated", tone: "info" },
};

export const deliveredIcon = CircleCheck;
