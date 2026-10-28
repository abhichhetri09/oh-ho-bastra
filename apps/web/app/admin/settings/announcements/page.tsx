import type { Metadata } from "next";
import { AnnouncementSettings } from "@/modules/admin/components/announcement-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import { storeBanner } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Announcement bar · Settings" };

export default async function AdminAnnouncementsPage() {
  const banner = await storeBanner();
  return (
    <SettingsSection page="announcements">
      <AnnouncementSettings
        initial={banner.announcements}
        initialEnabled={banner.enabled}
      />
    </SettingsSection>
  );
}
