import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { AnnouncementSettings } from "@/modules/admin/components/announcement-settings";
import { AppearanceSettings } from "@/modules/admin/components/appearance-settings";
import { savedStoreTheme, storeAnnouncements } from "@/lib/theme-server";
import { DEFAULT_THEME, isThemeId } from "@/lib/themes";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [saved, announcements] = await Promise.all([
    savedStoreTheme(),
    storeAnnouncements(),
  ]);
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Settings"
        description="How your storefront looks to shoppers."
      />
      <AppearanceSettings initial={isThemeId(saved) ? saved : DEFAULT_THEME} />
      <AnnouncementSettings initial={announcements} />
    </>
  );
}
