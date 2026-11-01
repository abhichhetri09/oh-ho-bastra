import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { ReferralsTable } from "@/modules/admin/components/referrals-table";
import { couponsPage } from "@/modules/admin/lib/coupons";

export const metadata: Metadata = { title: "Referrals" };

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Sales"
        title="Referrals"
        description="Friends' first orders through a customer's link. The referrer's credit pays out once the order has arrived and the wait in Settings → Referrals has passed; a refund before then cancels it."
      />
      {/* The same ?page= parsing as the coupons list. */}
      <ReferralsTable initialPage={couponsPage(await searchParams)} />
    </>
  );
}
