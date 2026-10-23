import type { OrderStatus } from "@repo/types";
import { cn } from "@/lib/utils";

const tone: Record<OrderStatus, { pill: string; dot: string }> = {
  pending: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  paid: { pill: "bg-foreground/[0.07] text-foreground", dot: "bg-foreground" },
  shipped: { pill: "bg-clay/10 text-clay", dot: "bg-clay" },
  delivered: { pill: "bg-success/10 text-success", dot: "bg-success" },
  cancelled: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  refunded: {
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

/** An order's status as a soft pill with a coloured dot. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-medium capitalize",
        tone[status].pill,
        status === "cancelled" && "line-through",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", tone[status].dot)}
      />
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
