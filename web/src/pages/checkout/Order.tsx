import { Link, useParams } from "react-router-dom";

import { BackToShop } from "@/components/common/BackToShop";
import { InfoBlock } from "@/components/common/InfoBlock";
import { SummaryPanel, WithSummary } from "@/components/common/SummaryPanel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Search, Shirt } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useCheckoutLabels } from "@/features/checkout/api";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { useOrder } from "@/features/orders/api";
import { OrderLines } from "@/features/orders/components/OrderLines";
import { OrderNextStep } from "@/features/orders/components/OrderNextStep";
import { CustomerOrderStatus } from "@/features/orders/components/CustomerOrderStatus";
import { OrderTotalsList } from "@/features/orders/components/OrderTotalsList";
import { ShippingAddress } from "@/features/orders/components/ShippingAddress";
import { orderHeading } from "@/features/orders/order-heading";
import type { Order as OrderData } from "@/features/orders/types";

export function Order() {
  const { orderId } = useParams();

  return (
    <PageShell>
      <QueryView
        query={useOrder(orderId)}
        notFound={
          <EmptyState
            icon={Search}
            title="Order not found"
            description="Check the link, or sign in to see your orders."
            action={<BackToShop />}
          />
        }
      >
        {(order) => <OrderView order={order} />}
      </QueryView>
    </PageShell>
  );
}

function OrderView({ order }: { order: OrderData }) {
  const labels = useCheckoutLabels();
  const { user } = useSessionUser();
  const { title, description } = orderHeading(order);

  return (
    <section className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageHeader kicker={`Order #${order.number}`} title={title} description={description} />
        <CustomerOrderStatus status={order.status} />
      </div>
      <OrderNextStep order={order} />

      <WithSummary>
        <OrderLines items={order.items} currency={order.currency} />
        <SummaryPanel sticky={false}>
          <OrderTotalsList totals={order} />
          <ShippingAddress address={order} />
          {order.payment ? (
            <InfoBlock title="Payment">
              <p>{labels.payment(order.payment.method)}</p>
              <p className="text-muted-foreground tabular-nums">Reference {order.payment.reference}</p>
            </InfoBlock>
          ) : null}
          {user ? (
            <Button variant="outline" className="w-full" asChild>
              <Link to="/account/orders">All your orders</Link>
            </Button>
          ) : null}
          <Button variant="outline" className="w-full" asChild>
            <Link to="/#shop">
              <Shirt />
              Keep shopping
            </Link>
          </Button>
        </SummaryPanel>
      </WithSummary>
    </section>
  );
}
