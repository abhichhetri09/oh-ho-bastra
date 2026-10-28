import type { Metadata } from "next";
import { AppearanceSettings } from "@/modules/admin/components/appearance-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { savedAppearance } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Appearance · Settings" };

export default async function AdminAppearancePage() {
  return (
    <SettingsSection page="appearance">
      <AppearanceSettings initial={await savedAppearance()} />
    </SettingsSection>
  );
}
