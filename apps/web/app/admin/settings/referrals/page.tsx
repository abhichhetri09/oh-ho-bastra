import type { Metadata } from "next";
import { ReferralSettings } from "@/modules/admin/components/referral-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { storeReferrals } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Referrals · Settings" };

export default async function AdminReferralsPage() {
  return (
    <SettingsSection page="referrals">
      <ReferralSettings initial={await storeReferrals()} />
    </SettingsSection>
  );
}
