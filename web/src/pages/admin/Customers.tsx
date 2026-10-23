import { QueryView } from "@/components/feedback/QueryView";
import { DataTable } from "@/components/ui/data-table";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { useAdminUsers, type UserFilters } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { customerColumns } from "@/features/admin/components/customers/customer-columns";
import { Panel } from "@/components/app-shell/Panel";
import { useListParams } from "@/features/admin/useListParams";

type View = "all" | "admins" | "banned";

// Each tab is a preset of API filters.
const views: Record<View, Pick<UserFilters, "role" | "status">> = {
  all: {},
  admins: { role: "admin" },
  banned: { status: "banned" },
};

export function Customers() {
  const { values, q, deferredQ, page, update } = useListParams(["view"] as const);
  const view = (values.view in views ? values.view : "all") as View;
  const query = useAdminUsers({ ...views[view], q: deferredQ || undefined, page });
  const counts = query.data?.counts;

  return (
    <AppPage title="Customers" description="Everyone with an account. Open someone to see their orders, change their role or ban them.">
      <Panel flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-2 pt-2 sm:px-4">
          <FilterTabs
            label="Filter customers"
            value={view}
            onChange={(next) => update({ view: next === "all" ? undefined : next })}
            tabs={[
              { value: "all", label: "All", count: counts?.all },
              { value: "admins", label: "Admins", count: counts?.admins },
              { value: "banned", label: "Banned", count: counts?.banned },
            ]}
          />
          <SearchField
            label="Search customers"
            placeholder="Name or email"
            value={q}
            onChange={(value) => update({ q: value })}
            className="mb-2"
          />
        </div>
        <QueryView query={query}>
          {(data) => (
            <>
              <DataTable
                columns={customerColumns}
                rows={data.rows}
                getKey={(u) => u.id}
                rowHref={(u) => `/admin/customers/${u.id}`}
                empty={q ? "Nobody matches that search." : "No customers here."}
              />
              <div className="border-t">
                <Pagination {...data} noun="customers" onPage={(next) => update({ page: next })} />
              </div>
            </>
          )}
        </QueryView>
      </Panel>
    </AppPage>
  );
}
