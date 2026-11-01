import type { Metadata } from "next";
import { AppearanceSettings } from "@/modules/admin/components/appearance-settings";
import { LogoSettings } from "@/modules/admin/components/logo-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { savedAppearance, storeLogo } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Appearance · Settings" };

export default async function AdminAppearancePage() {
  return (
    <SettingsSection page="appearance">
      <div className="space-y-6">
        <LogoSettings initial={await storeLogo()} />
        <AppearanceSettings initial={await savedAppearance()} />
      </div>
    </SettingsSection>
  );
}
