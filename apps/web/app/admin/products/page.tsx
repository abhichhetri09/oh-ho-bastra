import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import {
  NewProductButton,
  ProductsTable,
} from "@/modules/admin/components/products-table";
import {
  adminProductsSearch,
  parseAdminProductFilters,
} from "@/modules/admin/lib/filters";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminProductFilters(await searchParams);
  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Products"
        actions={<NewProductButton />}
      />
      {/* The table owns its filters once mounted; a navigation to another
          URL (the sidebar's plain "Products") starts it over from that URL. */}
      <ProductsTable key={adminProductsSearch(filters)} initial={filters} />
    </>
  );
}
