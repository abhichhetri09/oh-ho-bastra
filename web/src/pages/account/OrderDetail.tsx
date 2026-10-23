import { useParams } from "react-router-dom";

import { AppPage } from "@/components/app-shell/AppPage";
import { Panel } from "@/components/app-shell/Panel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Search, Truck } from "@/components/icons";
import { SummaryList } from "@/components/ui/summary-list";
import { useCheckoutLabels } from "@/features/checkout/api";
import { useOrder } from "@/features/orders/api";
import { CustomerOrderStatus } from "@/features/orders/components/CustomerOrderStatus";
import { OrderLines } from "@/features/orders/components/OrderLines";
import { OrderNextStep } from "@/features/orders/components/OrderNextStep";
import { OrderTotalsList } from "@/features/orders/components/OrderTotalsList";
import { orderHeading } from "@/features/orders/order-heading";
import type { Order } from "@/features/orders/types";
import { formatDateTime } from "@/lib/format";

export function AccountOrderDetail() {
  const { orderId } = useParams();
  return (
    <QueryView
      query={useOrder(orderId)}
      notFound={<EmptyState icon={Search} title="Order not found" description="It may belong to another account." />}
    >
      {(order) => <OrderDetailView order={order} />}
    </QueryView>
  );
}

function OrderDetailView({ order }: { order: Order }) {
  const labels = useCheckoutLabels();
  return (
    <AppPage
      back={{ to: "/account/orders", label: "Orders" }}
      title={`Order #${order.number}`}
      meta={<CustomerOrderStatus status={order.status} />}
      description={orderHeading(order).description}
      actions={<OrderNextStep order={order} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Items" flush>
            <div className="px-4 [&>ul]:border-y-0">
              <OrderLines items={order.items} currency={order.currency} />
            </div>
          </Panel>
          <Panel title="Delivery">
            <div className="grid gap-6 sm:grid-cols-2">
              <address className="space-y-0.5 text-sm not-italic">
                <p className="font-medium">
                  {order.firstName} {order.lastName}
                </p>
                <p>{order.street}</p>
                <p>
                  {order.postalCode} {order.city}, {order.country}
                </p>
                <p className="text-muted-foreground">{order.phone}</p>
              </address>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{labels.shipping(order.shippingMethod)}</p>
                {order.trackingNumber ? (
                  <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                    <Truck className="size-4 text-muted-foreground" aria-hidden />
                    <span>
                      Tracking <span className="font-medium tabular-nums">{order.trackingNumber}</span>
                    </span>
                  </p>
                ) : order.status === "paid" ? (
                  <p className="text-muted-foreground">We’ll add a tracking number when it ships.</p>
                ) : null}
              </div>
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Summary">
            <OrderTotalsList totals={order} />
          </Panel>
          <Panel title="Details">
            <SummaryList
              rows={[
                { label: "Placed", value: formatDateTime(order.createdAt) },
                { label: "Paid", value: order.paidAt ? formatDateTime(order.paidAt) : "—" },
                { label: "Shipped", value: order.shippedAt ? formatDateTime(order.shippedAt) : "—" },
                { label: "Payment", value: order.payment ? labels.payment(order.payment.method) : "—" },
                { label: "Reference", value: order.payment?.reference ?? "—" },
              ]}
            />
          </Panel>
        </div>
      </div>
    </AppPage>
  );
}
