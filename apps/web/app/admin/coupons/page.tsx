import type { Metadata } from "next";
import { CouponsManager } from "@/modules/admin/components/coupons-manager";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { couponsPage } from "@/modules/admin/lib/coupons";

export const metadata: Metadata = { title: "Coupons" };

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Sales"
        title="Coupons"
        description="Discount codes shoppers enter in their bag. A checkout that hasn't been paid yet holds its use until it's cancelled."
      />
      <CouponsManager initialPage={couponsPage(await searchParams)} />
    </>
  );
}
