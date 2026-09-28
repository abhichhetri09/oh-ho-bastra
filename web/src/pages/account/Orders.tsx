import { useSearchParams } from "react-router-dom";

import { AppPage } from "@/components/app-shell/AppPage";
import { QueryView } from "@/components/feedback/QueryView";
import { FilterTabs, type FilterTab } from "@/components/ui/filter-tabs";
import { Pagination } from "@/components/ui/pagination";
import { useAccountOrders } from "@/features/account/api";
import { Panel } from "@/components/app-shell/Panel";
import { AccountOrderRow } from "@/features/account/components/AccountOrderRow";
import type { AccountOrdersPage } from "@/features/account/types";
import { customerStatuses } from "@/features/orders/customer-status";
import type { OrderStatus } from "@/features/orders/types";

const statuses: OrderStatus[] = [
  "paid",
  "fulfilled",
  "pending_payment",
  "cancelled",
];

function tabs(
  counts: AccountOrdersPage["statusCounts"] = {},
): FilterTab<OrderStatus | "all">[] {
  const all = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return [
    { value: "all", label: "All", count: all },
    // Only show statuses the customer actually has orders in.
    ...statuses
      .filter((s) => counts[s])
      .map((s) => ({
        value: s,
        label: customerStatuses[s].label,
        count: counts[s],
      })),
  ];
}

export function AccountOrders() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as OrderStatus | null) ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = useAccountOrders({ status, page });

  function update(next: { status?: OrderStatus; page?: number }) {
    const search = new URLSearchParams();
    const s = "status" in next ? next.status : status;
    if (s) search.set("status", s);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    setParams(search, { replace: true });
  }

  return (
    <AppPage
      title="Orders"
      description="Open an order to see its receipt, delivery address and tracking."
    >
      <Panel flush>
        <div className="border-b px-2 sm:px-3">
          <FilterTabs
            label="Filter orders"
            tabs={tabs(query.data?.statusCounts)}
            value={status ?? "all"}
            onChange={(value) =>
              update({ status: value === "all" ? undefined : value })
            }
          />
        </div>
        <QueryView query={query}>
          {(data) =>
            data.rows.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                No orders here yet.
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {data.rows.map((order) => (
                    <AccountOrderRow key={order.id} order={order} />
                  ))}
                </ul>
                <div className="border-t">
                  <Pagination
                    {...data}
                    noun="orders"
                    onPage={(next) => update({ page: next })}
                  />
                </div>
              </>
            )
          }
        </QueryView>
      </Panel>
    </AppPage>
  );
}
