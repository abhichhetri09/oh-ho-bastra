import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReferralsView } from "@/modules/account/components/referrals-view";
import { siteUrl } from "@/lib/site-url";
import { storeReferrals } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  // Not there at all while the programme is off.
  if (!(await storeReferrals()).enabled) notFound();
  return <ReferralsView origin={siteUrl()} />;
}
