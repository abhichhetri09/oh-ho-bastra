import type { Metadata } from "next";
import { OrdersTable } from "@/modules/admin/components/orders-table";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import {
  adminOrdersSearch,
  parseAdminOrderFilters,
} from "@/modules/admin/lib/order-filters";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminOrderFilters(await searchParams);
  return (
    <>
      <AdminPageHeader eyebrow="Sales" title="Orders" />
      {/* Remounts on navigation to another URL, as the products table does. */}
      <OrdersTable key={adminOrdersSearch(filters)} initial={filters} />
    </>
  );
}
