import { Link } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import type { Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { userStatus } from "@/features/admin/status";
import type { AdminUserRow } from "@/features/admin/types";
import { formatDate, formatPrice } from "@/lib/format";

export const customerColumns: Column<AdminUserRow>[] = [
  {
    key: "name",
    header: "Customer",
    cell: (u) => (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={u.name} size="sm" />
        <div className="min-w-0">
          <Link to={`/admin/customers/${u.id}`} className="block truncate font-medium hover:underline">
            {u.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: "role",
    header: "Role",
    hideBelow: "sm",
    cell: (u) => (u.role === "admin" ? <StatusPill tone="info">Admin</StatusPill> : <span className="text-muted-foreground">Customer</span>),
  },
  {
    key: "status",
    header: "Status",
    cell: (u) => {
      const s = userStatus(u);
      return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
    },
  },
  { key: "orders", header: "Orders", align: "right", hideBelow: "md", className: "tabular-nums", cell: (u) => u.orderCount },
  {
    key: "spent",
    header: "Spent",
    align: "right",
    hideBelow: "md",
    className: "tabular-nums whitespace-nowrap",
    cell: (u) => formatPrice(u.totalSpentCents),
  },
  {
    key: "joined",
    header: "Joined",
    hideBelow: "lg",
    className: "text-muted-foreground tabular-nums",
    cell: (u) => formatDate(u.createdAt),
  },
];
