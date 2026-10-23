import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Search } from "@/components/icons";
import { useAdminOrder } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { OrderActionsBar } from "@/features/admin/components/orders/OrderActionsBar";
import { CustomerCard, ShippingCard, TotalsCard } from "@/features/admin/components/orders/OrderSideCards";
import { OrderTimeline } from "@/features/admin/components/orders/OrderTimeline";
import { PaymentsTable } from "@/features/admin/components/orders/PaymentsTable";
import { OrderStatus } from "@/features/admin/components/OrderStatus";
import { Panel } from "@/components/app-shell/Panel";
import type { AdminOrder } from "@/features/admin/types";
import { OrderLines } from "@/features/orders/components/OrderLines";
import { formatDateTime, plural } from "@/lib/format";

const back = { to: "/admin/orders", label: "Orders" };

export function OrderDetail() {
  const { orderId } = useParams();
  return (
    <QueryView
      query={useAdminOrder(orderId)}
      notFound={<EmptyState icon={Search} title="Order not found" description="It may have been removed, or the link is wrong." />}
    >
      {(order) => <OrderDetailView order={order} />}
    </QueryView>
  );
}

function OrderDetailView({ order }: { order: AdminOrder }) {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <AppPage
      back={back}
      title={`Order #${order.number}`}
      meta={<OrderStatus status={order.status} />}
      description={`Placed ${formatDateTime(order.createdAt)} · ${plural(units, "item")}`}
      actions={<OrderActionsBar order={order} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Items" flush>
            <div className="px-4 [&>ul]:border-y-0">
              <OrderLines items={order.items} currency={order.currency} showSku />
            </div>
          </Panel>
          <PaymentsTable order={order} />
          <OrderTimeline order={order} />
        </div>
        <div className="space-y-6">
          <CustomerCard order={order} />
          <ShippingCard order={order} />
          <TotalsCard order={order} />
        </div>
      </div>
    </AppPage>
  );
}
