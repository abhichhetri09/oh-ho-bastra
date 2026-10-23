import { Link } from "react-router-dom";

import { ArrowRight } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel } from "@/components/app-shell/Panel";
import type { Overview } from "@/features/admin/types";
import { formatDate } from "@/lib/format";

const seeAll = (to: string, label: string) => (
  <Link to={to} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
    {label}
    <ArrowRight className="size-3.5" aria-hidden />
  </Link>
);

export function ToShipList({ overview }: { overview: Overview }) {
  return (
    <Panel title="To ship" description="Paid, oldest first" actions={seeAll("/admin/orders?status=paid", "All")} flush>
      {overview.toShip.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing waiting to ship.</p>
      ) : (
        <ul className="divide-y text-sm">
          {overview.toShip.map((order) => (
            <li key={order.id}>
              <Link to={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 truncate">
                  <span className="font-medium">#{order.number}</span>
                  <span className="ml-2 text-muted-foreground">
                    {order.firstName} {order.lastName}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  paid {order.paidAt ? formatDate(order.paidAt) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function LowStockList({ overview }: { overview: Overview }) {
  return (
    <Panel
      title="Low stock"
      description={`${overview.lowStockThreshold} or fewer left`}
      actions={seeAll("/admin/products", "Products")}
      flush
    >
      {overview.lowStock.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Every size is above the threshold.</p>
      ) : (
        <ul className="divide-y text-sm">
          {overview.lowStock.map((variant) => (
            <li key={variant.sku} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate">
                {variant.productName}
                <span className="ml-2 text-muted-foreground">{variant.size}</span>
              </span>
              <StatusPill tone={variant.stock === 0 ? "danger" : "warning"}>
                {variant.stock === 0 ? "Sold out" : `${variant.stock} left`}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
