import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { Device, Search } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { SummaryList } from "@/components/ui/summary-list";
import { useAdminUser } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { CustomerActions } from "@/features/admin/components/customers/CustomerActions";
import { orderColumns, orderHref } from "@/features/admin/components/order-columns";
import { StatGrid } from "@/components/common/StatTile";
import { Panel } from "@/components/app-shell/Panel";
import { userStatus } from "@/features/admin/status";
import type { AdminUser } from "@/features/admin/types";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { deviceLabel } from "@/lib/user-agent";

const { number, placed, items, total, status } = orderColumns;
const providerNames: Record<string, string> = { credential: "Email and password", google: "Google" };

export function CustomerDetail() {
  const { userId } = useParams();
  return (
    <QueryView
      query={useAdminUser(userId)}
      notFound={<EmptyState icon={Search} title="Customer not found" description="The account may have been deleted." />}
    >
      {(user) => <CustomerView user={user} />}
    </QueryView>
  );
}

function CustomerView({ user }: { user: AdminUser }) {
  const s = userStatus(user);
  return (
    <AppPage
      back={{ to: "/admin/customers", label: "Customers" }}
      title={
        <span className="flex items-center gap-3">
          <Avatar name={user.name} size="lg" />
          {user.name}
        </span>
      }
      meta={
        <>
          {user.role === "admin" ? <StatusPill tone="info">Admin</StatusPill> : null}
          <StatusPill tone={s.tone}>{s.label}</StatusPill>
        </>
      }
      description={user.email}
      actions={<CustomerActions user={user} />}
    >
      {user.banned && user.banReason ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">Ban reason: {user.banReason}</p>
      ) : null}

      <StatGrid
        stats={[
          { label: "Orders", value: String(user.orderCount) },
          { label: "Spent", value: formatPrice(user.totalSpentCents), note: "Paid and shipped orders" },
          { label: "Last order", value: user.lastOrderAt ? formatDate(user.lastOrderAt) : "—" },
          { label: "Joined", value: formatDate(user.createdAt) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Orders" flush className="min-w-0">
          <DataTable
            columns={[number, placed, items, total, status]}
            rows={user.orders}
            getKey={(o) => o.id}
            rowHref={orderHref}
            empty="No orders placed with this account."
          />
        </Panel>
        <div className="space-y-6">
          <Panel title="Account">
            <SummaryList
              rows={[
                { label: "Email verified", value: user.emailVerified ? "Yes" : "No" },
                { label: "Sign-in", value: user.providers.map((p) => providerNames[p] ?? p).join(", ") || "—" },
                { label: "Role", value: user.role === "admin" ? "Admin" : "Customer" },
              ]}
            />
          </Panel>
          <Panel title="Active sessions" description={`${user.sessions.length} signed-in device${user.sessions.length === 1 ? "" : "s"}`} flush>
            {user.sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Not signed in anywhere.</p>
            ) : (
              <ul className="divide-y text-sm">
                {user.sessions.map((session) => (
                  <li key={session.id} className="flex items-start gap-3 px-4 py-3">
                    <Device className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p>{deviceLabel(session.userAgent)}</p>
                      <p className="text-xs text-muted-foreground">
                        Since {formatDateTime(session.createdAt)}
                        {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AppPage>
  );
}
