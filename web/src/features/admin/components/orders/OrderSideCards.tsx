import { Link } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { SummaryList } from "@/components/ui/summary-list";
import { Panel } from "@/components/app-shell/Panel";
import type { AdminOrder } from "@/features/admin/types";
import { useCheckoutLabels } from "@/features/checkout/api";
import { OrderTotalsList } from "@/features/orders/components/OrderTotalsList";
import { TrackingEditor } from "./TrackingEditor";
import { formatDateTime } from "@/lib/format";

export function CustomerCard({ order }: { order: AdminOrder }) {
  const name = `${order.firstName} ${order.lastName}`;
  return (
    <Panel title="Customer">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 text-sm">
          {order.customer ? (
            <Link to={`/admin/customers/${order.customer.id}`} className="font-medium hover:underline">
              {order.customer.name}
            </Link>
          ) : (
            <p className="font-medium">{name}</p>
          )}
          <p className="text-xs text-muted-foreground">{order.customer ? "Has an account" : "Guest checkout"}</p>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <a href={`mailto:${order.email}`} className="block truncate hover:underline">
          {order.email}
        </a>
        <a href={`tel:${order.phone}`} className="block hover:underline">
          {order.phone}
        </a>
      </div>
    </Panel>
  );
}

export function ShippingCard({ order }: { order: AdminOrder }) {
  const labels = useCheckoutLabels();
  return (
    <Panel title="Shipping">
      <div className="space-y-1 text-sm">
        <p>
          {order.firstName} {order.lastName}
        </p>
        <p>{order.street}</p>
        <p>
          {order.postalCode} {order.city}, {order.country}
        </p>
      </div>
      <div className="mt-4 space-y-2 border-t pt-4">
        <SummaryList
          rows={[
            { label: "Method", value: labels.shipping(order.shippingMethod) },
            { label: "Shipped", value: order.shippedAt ? formatDateTime(order.shippedAt) : "—" },
          ]}
        />
        {/* Keyed so a saved number resets the editor's draft. */}
        <TrackingEditor key={order.trackingNumber ?? ""} order={order} />
      </div>
    </Panel>
  );
}

export function TotalsCard({ order }: { order: AdminOrder }) {
  return (
    <Panel title="Summary">
      <OrderTotalsList totals={order} />
      <SummaryList
        className="mt-4 border-t pt-4"
        rows={[
          { label: "Placed", value: formatDateTime(order.createdAt) },
          { label: "Paid", value: order.paidAt ? formatDateTime(order.paidAt) : "—" },
        ]}
      />
    </Panel>
  );
}
