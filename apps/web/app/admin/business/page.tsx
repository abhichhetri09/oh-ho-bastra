import type { Metadata } from "next";
import { BusinessSettings } from "@/modules/admin/components/business-settings";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { storeBusiness } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Business" };

export default async function AdminBusinessPage() {
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Business"
        description="The seller details shown on your contact page, footer, terms of sale and privacy policy."
      />
      <BusinessSettings initial={await storeBusiness()} />
    </>
  );
}
