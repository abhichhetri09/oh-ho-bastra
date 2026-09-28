import { AppShell } from "@/components/app-shell/AppShell";
import type { ShellConfig } from "@/components/app-shell/types";
import { Boxes, Dashboard, Receipt, Settings, Users } from "@/components/icons";
import { useOverview } from "./api";
import { AdminGuard } from "./components/AdminGuard";
import { settingsSections } from "./settings-sections";

function useAdminNav(): ShellConfig {
  const { data } = useOverview();
  return {
    label: "Admin",
    home: "/admin",
    sections: [
      { items: [{ to: "/admin", label: "Dashboard", icon: Dashboard, end: true }] },
      { title: "Sales", items: [{ to: "/admin/orders", label: "Orders", icon: Receipt, badge: data?.statusCounts.paid }] },
      { title: "Catalog", items: [{ to: "/admin/products", label: "Products", icon: Boxes, badge: data?.lowStock.length }] },
      { title: "People", items: [{ to: "/admin/customers", label: "Customers", icon: Users }] },
      {
        title: "System",
        items: [
          {
            to: "/admin/settings",
            label: "Settings",
            icon: Settings,
            children: settingsSections.map(({ key, label, icon }) => ({ to: `/admin/settings/${key}`, label, icon })),
          },
        ],
      },
    ],
  };
}

function AdminApp() {
  return <AppShell config={useAdminNav()} />;
}

export function AdminShell() {
  return (
    <AdminGuard>
      <AdminApp />
    </AdminGuard>
  );
}
