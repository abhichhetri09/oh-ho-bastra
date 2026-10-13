import type { Metadata } from "next";
import { CategoryManager } from "@/modules/admin/components/category-manager";
import { AdminPageHeader } from "@/modules/admin/components/page-header";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Categories"
        description="The store's navigation follows this tree."
      />
      <CategoryManager />
    </>
  );
}
