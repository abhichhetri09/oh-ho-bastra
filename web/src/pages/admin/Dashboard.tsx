import { QueryView } from "@/components/feedback/QueryView";
import { Package, Receipt, Truck, Users } from "@/components/icons";
import { DataTable } from "@/components/ui/data-table";
import { useOverview } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { orderColumns, orderHref } from "@/features/admin/components/order-columns";
import { LowStockList, ToShipList } from "@/features/admin/components/overview/AttentionLists";
import { RevenueHeadline } from "@/features/admin/components/overview/RevenueHeadline";
import { StatGrid, type Stat } from "@/components/common/StatTile";
import { Panel } from "@/components/app-shell/Panel";
import { periodDelta } from "@/features/admin/overview-math";
import type { Overview } from "@/features/admin/types";
import { formatPrice } from "@/lib/format";

function stats({ current, previous, statusCounts, customers }: Overview): Stat[] {
  return [
    {
      label: "Paid orders",
      value: String(current.orders),
      note: periodDelta(current.orders, previous.orders),
      icon: Receipt,
      to: "/admin/orders",
    },
    {
      label: "Average order",
      value: current.orders > 0 ? formatPrice(Math.round(current.revenueCents / current.orders)) : "—",
      note: "Last 30 days",
      icon: Package,
    },
    {
      label: "To ship",
      value: String(statusCounts.paid ?? 0),
      note: `${statusCounts.pending_payment ?? 0} awaiting payment`,
      icon: Truck,
      to: "/admin/orders?status=paid",
    },
    {
      label: "Customers",
      value: String(customers.total),
      note: `${customers.new30} new in 30 days`,
      icon: Users,
      to: "/admin/customers",
    },
  ];
}

const { number, customer, total, status } = orderColumns;

export function Dashboard() {
  return (
    <AppPage title="Dashboard" description="How the shop is doing over the last 30 days.">
      <QueryView query={useOverview()}>
        {(data) => (
          <div className="space-y-6">
            <StatGrid stats={stats(data)} />
            <RevenueHeadline overview={data} />
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <Panel title="Recent orders" flush>
                <DataTable columns={[number, customer, total, status]} rows={data.recent} getKey={(o) => o.id} rowHref={orderHref} dense />
              </Panel>
              <div className="space-y-6">
                <ToShipList overview={data} />
                <LowStockList overview={data} />
              </div>
            </div>
          </div>
        )}
      </QueryView>
    </AppPage>
  );
}
