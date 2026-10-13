import type { Metadata } from "next";
import { CustomersTable } from "@/modules/admin/components/customers-table";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import {
  adminCustomersSearch,
  parseAdminCustomerFilters,
} from "@/modules/admin/lib/order-filters";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminCustomerFilters(await searchParams);
  return (
    <>
      <AdminPageHeader eyebrow="Sales" title="Customers" />
      {/* Remounts on navigation to another URL, as the orders table does. */}
      <CustomersTable key={adminCustomersSearch(filters)} initial={filters} />
    </>
  );
}
