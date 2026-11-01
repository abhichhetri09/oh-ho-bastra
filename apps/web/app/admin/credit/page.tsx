import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { StoreCredit } from "@/modules/admin/components/store-credit";

export const metadata: Metadata = { title: "Store credit" };

export default function AdminStoreCreditPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="Sales"
        title="Store credit"
        description="Find a customer to see their credit, use it on an in-store bill (they read out a code we email them), or adjust it with a note."
      />
      <StoreCredit />
    </>
  );
}
