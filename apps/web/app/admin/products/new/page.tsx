import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { BackToProducts } from "@/modules/admin/components/product-editor";
import { ProductForm } from "@/modules/admin/components/product-form";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <>
      <BackToProducts />
      <AdminPageHeader
        eyebrow="Catalog"
        title="New product"
        description="Its variants (prices, stock and options) come next, once it is saved."
      />
      <ProductForm />
    </>
  );
}
