import { Link } from "react-router-dom";

import type { Column } from "@/components/ui/data-table";
import type { AdminOrderRow } from "@/features/admin/types";
import { formatDateTime, formatPrice } from "@/lib/format";
import { OrderStatus } from "./OrderStatus";

/** Order table columns, shared by the orders list, dashboard and customer page. */
export const orderColumns: Record<string, Column<AdminOrderRow>> = {
  number: {
    key: "number",
    header: "Order",
    cell: (o) => (
      <Link to={`/admin/orders/${o.id}`} className="font-medium hover:underline">
        #{o.number}
      </Link>
    ),
  },
  placed: {
    key: "placed",
    header: "Placed",
    hideBelow: "md",
    className: "text-muted-foreground tabular-nums whitespace-nowrap",
    cell: (o) => formatDateTime(o.createdAt),
  },
  customer: {
    key: "customer",
    header: "Customer",
    cell: (o) => (
      <div className="min-w-0">
        <p className="truncate">
          {o.firstName} {o.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{o.email}</p>
      </div>
    ),
  },
  items: { key: "items", header: "Items", align: "right", hideBelow: "sm", className: "tabular-nums", cell: (o) => o.itemCount },
  total: {
    key: "total",
    header: "Total",
    align: "right",
    className: "tabular-nums whitespace-nowrap",
    cell: (o) => formatPrice(o.totalCents, o.currency),
  },
  status: { key: "status", header: "Status", cell: (o) => <OrderStatus status={o.status} /> },
};

export const orderHref = (o: AdminOrderRow) => `/admin/orders/${o.id}`;
