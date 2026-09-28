import { Link } from "react-router-dom";

import { AppPage } from "@/components/app-shell/AppPage";
import { StatGrid } from "@/components/common/StatTile";
import { QueryView } from "@/components/feedback/QueryView";
import { ArrowRight, Package, Receipt, Truck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAccountSummary } from "@/features/account/api";
import { Panel } from "@/components/app-shell/Panel";
import { AccountOrderRow } from "@/features/account/components/AccountOrderRow";
import { AddressView } from "@/features/account/components/AddressView";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { formatDate, formatPrice } from "@/lib/format";

export function AccountOverview() {
  const { user } = useSessionUser();
  const firstName = user?.name.split(" ")[0];
  return (
    <AppPage
      title={firstName ? `Hi, ${firstName}` : "Your account"}
      description="Your orders, delivery address and account settings."
    >
      <QueryView query={useAccountSummary()}>
        {(summary) => (
          <div className="space-y-6">
            <StatGrid
              stats={[
                {
                  label: "Orders",
                  value: String(summary.orders),
                  icon: Receipt,
                  to: "/account/orders",
                },
                {
                  label: "On the way",
                  value: String(summary.inTransit),
                  note: "Paid, being prepared",
                  icon: Truck,
                },
                {
                  label: "Spent",
                  value: formatPrice(summary.spentCents),
                  icon: Package,
                },
                {
                  label: "Member since",
                  value: formatDate(summary.memberSince),
                },
              ]}
            />

            <Panel
              title="Recent orders"
              flush
              actions={
                summary.orders > 0 ? (
                  <Link
                    to="/account/orders"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    All orders
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : null
              }
            >
              {summary.recent.length === 0 ? (
                <div className="space-y-4 p-5 text-sm">
                  <p className="text-muted-foreground">
                    No orders yet. When you buy something it shows up here.
                  </p>
                  <Button asChild>
                    <Link to="/#shop">Shop tees</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {summary.recent.map((order) => (
                    <AccountOrderRow key={order.id} order={order} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Delivery address"
              description="Filled in for you at checkout."
              actions={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/account/address">
                    {summary.address ? "Edit" : "Add address"}
                  </Link>
                </Button>
              }
            >
              {summary.address ? (
                <AddressView address={summary.address} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No saved address yet.
                </p>
              )}
            </Panel>
          </div>
        )}
      </QueryView>
    </AppPage>
  );
}
