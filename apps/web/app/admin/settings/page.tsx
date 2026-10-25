import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { AnnouncementSettings } from "@/modules/admin/components/announcement-settings";
import { AppearanceSettings } from "@/modules/admin/components/appearance-settings";
import { BusinessSettings } from "@/modules/admin/components/business-settings";
import {
  savedStoreTheme,
  storeBanner,
  storeBusiness,
} from "@/lib/theme-server";
import { DEFAULT_THEME, isThemeId } from "@/lib/themes";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [saved, banner, business] = await Promise.all([
    savedStoreTheme(),
    storeBanner(),
    storeBusiness(),
  ]);
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Settings"
        description="How your storefront looks to shoppers, and who's selling."
      />
      <AppearanceSettings initial={isThemeId(saved) ? saved : DEFAULT_THEME} />
      <AnnouncementSettings
        initial={banner.announcements}
        initialEnabled={banner.enabled}
      />
      <BusinessSettings initial={business} />
    </>
  );
}
