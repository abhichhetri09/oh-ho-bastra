import type { Tone } from "@/components/ui/status-pill";
import type { OrderStatus } from "./types";

// Customer wording: what's happening from the buyer's side.
export const customerStatuses: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: "Awaiting payment", tone: "warning" },
  paid: { label: "Preparing", tone: "info" },
  fulfilled: { label: "Shipped", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
