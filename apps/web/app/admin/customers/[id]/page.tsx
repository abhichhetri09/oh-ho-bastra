import type { Metadata } from "next";
import { CustomerDetailView } from "@/modules/admin/components/customer-detail";

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CustomerDetailView id={(await params).id} />;
}
