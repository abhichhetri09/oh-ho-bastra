import { QueryView } from "@/components/feedback/QueryView";
import { DataTable } from "@/components/ui/data-table";
import { FilterTabs, type FilterTab } from "@/components/ui/filter-tabs";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { useAdminOrders } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { orderColumns, orderHref } from "@/features/admin/components/order-columns";
import { Panel } from "@/components/app-shell/Panel";
import { adminOrderLabels } from "@/features/admin/status";
import type { OrdersPage } from "@/features/admin/types";
import { useListParams } from "@/features/admin/useListParams";
import type { OrderStatus } from "@/features/orders/types";

const statuses: OrderStatus[] = ["paid", "pending_payment", "fulfilled", "cancelled"];

function tabs(counts: OrdersPage["statusCounts"] = {}): FilterTab<OrderStatus | "all">[] {
  const all = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return [
    { value: "all", label: "All", count: all },
    ...statuses.map((s) => ({ value: s, label: adminOrderLabels[s], count: counts[s] ?? 0 })),
  ];
}

const columns = Object.values(orderColumns);

export function Orders() {
  const { values, q, deferredQ, page, update } = useListParams(["status"] as const);
  const status = (values.status || undefined) as OrderStatus | undefined;
  const query = useAdminOrders({ status, q: deferredQ || undefined, page });

  return (
    <AppPage title="Orders" description="Every order, newest first. Paid orders are waiting for you to ship them.">
      <Panel flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-2 pt-2 sm:px-4">
          <FilterTabs
            label="Filter by status"
            tabs={tabs(query.data?.statusCounts)}
            value={status ?? "all"}
            onChange={(value) => update({ status: value === "all" ? undefined : value })}
          />
          <SearchField
            label="Search orders"
            placeholder="Name, email or order number"
            value={q}
            onChange={(value) => update({ q: value })}
            className="mb-2"
          />
        </div>
        <QueryView query={query}>
          {(data) => (
            <>
              <DataTable
                columns={columns}
                rows={data.rows}
                getKey={(o) => o.id}
                rowHref={orderHref}
                empty={q ? "No orders match that search." : "No orders yet."}
              />
              <div className="border-t">
                <Pagination {...data} noun="orders" onPage={(next) => update({ page: next })} />
              </div>
            </>
          )}
        </QueryView>
      </Panel>
    </AppPage>
  );
}
