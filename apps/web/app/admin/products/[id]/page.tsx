import type { Metadata } from "next";
import { ProductEditor } from "@/modules/admin/components/product-editor";

export const metadata: Metadata = { title: "Edit product" };

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
