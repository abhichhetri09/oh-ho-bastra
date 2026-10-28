import type { Metadata } from "next";
import { BusinessSettings } from "@/modules/admin/components/business-settings";
import { DeliverySettings } from "@/modules/admin/components/delivery-settings";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { storeBusiness, storeShipping } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Business" };

export default async function AdminBusinessPage() {
  const [business, shipping] = await Promise.all([
    storeBusiness(),
    storeShipping(),
  ]);
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Business"
        description="The seller details shown on your contact page, footer, terms of sale and privacy policy, and what delivery costs."
      />
      <BusinessSettings initial={business} />
      <section
        id="delivery"
        aria-label="Delivery"
        className="mt-6 scroll-mt-24"
      >
        <DeliverySettings initial={shipping} />
      </section>
    </>
  );
}
