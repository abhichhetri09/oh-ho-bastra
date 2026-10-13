import type { OrderStatus } from "@repo/types";
import { cn } from "@/lib/utils";

const tone: Record<OrderStatus, string> = {
  pending: "border-border text-muted-foreground",
  paid: "border-foreground/30 text-foreground",
  shipped: "border-clay/40 text-clay",
  delivered: "border-success/40 text-success",
  cancelled: "border-border text-muted-foreground line-through",
  refunded: "border-destructive/40 text-destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center border px-2 font-mono text-[0.625rem] tracking-[0.14em] uppercase",
        tone[status],
      )}
    >
      {status}
    </span>
  );
}

/** Live or hidden, for products and variants. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.14em] uppercase",
        active ? "text-success" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground/50",
        )}
      />
      {active ? "Active" : "Hidden"}
    </span>
  );
}
