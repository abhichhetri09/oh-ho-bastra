import type { Metadata } from "next";
import { BusinessSettings } from "@/modules/admin/components/business-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { storeBusiness } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Store details · Settings" };

export default async function AdminStoreDetailsPage() {
  return (
    <SettingsSection page="store">
      <BusinessSettings initial={await storeBusiness()} />
    </SettingsSection>
  );
}
