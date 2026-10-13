import type { Metadata } from "next";
import { InventoryTable } from "@/modules/admin/components/inventory-table";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import {
  adminInventorySearch,
  parseAdminInventoryFilters,
} from "@/modules/admin/lib/order-filters";

export const metadata: Metadata = { title: "Inventory" };

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminInventoryFilters(await searchParams);
  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Inventory"
        description="Every variant on sale, lowest stock first. Type a new count and press Enter."
      />
      {/* Remounts on navigation to another URL, as the orders table does. */}
      <InventoryTable key={adminInventorySearch(filters)} initial={filters} />
    </>
  );
}
