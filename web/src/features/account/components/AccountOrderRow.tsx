import { Link } from "react-router-dom";

import { ChevronRight, Truck } from "@/components/icons";
import type { AccountOrder } from "@/features/account/types";
import { CustomerOrderStatus } from "@/features/orders/components/CustomerOrderStatus";
import { formatDate, formatPrice, plural } from "@/lib/format";

export function AccountOrderRow({ order }: { order: AccountOrder }) {
  const others = order.itemCount - 1;
  return (
    <li>
      <Link
        to={`/account/orders/${order.id}`}
        className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Order #{order.number}</span>
            <CustomerOrderStatus status={order.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {order.firstItem ?? "Order"}
            {others > 0 ? ` and ${plural(others, "more item")}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Placed {formatDate(order.createdAt)}
            {order.trackingNumber ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Truck className="size-3" aria-hidden />
                {order.trackingNumber}
              </span>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {formatPrice(order.totalCents, order.currency)}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
