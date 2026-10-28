import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { AnnouncementSettings } from "@/modules/admin/components/announcement-settings";
import { AppearanceSettings } from "@/modules/admin/components/appearance-settings";
import { SettingsSection } from "@/modules/admin/components/settings-section";
import {
  STATUS_ICONS,
  StoreStatus,
} from "@/modules/admin/components/store-status";
import {
  savedAppearance,
  storeBanner,
  storeBusiness,
} from "@/lib/theme-server";
import { themeById } from "@/lib/themes";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [appearance, banner, business] = await Promise.all([
    savedAppearance(),
    storeBanner(),
    storeBusiness(),
  ]);
  const customised = appearance.font !== null || appearance.corners !== null;
  const missing = [
    business.business_name,
    business.business_id,
    business.business_address,
    business.business_email,
  ].filter((v) => !v.trim()).length;
  const bannerLive = banner.enabled && banner.announcements.length > 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Settings"
        description="How your storefront looks and what it tells shoppers."
      />

      <StoreStatus
        tiles={[
          {
            label: "Theme",
            value: themeById(appearance.theme).name,
            detail: customised
              ? "Customised, live on the storefront"
              : "Live on the storefront",
            href: "#appearance",
            icon: STATUS_ICONS.theme,
            tone: "ok",
          },
          {
            label: "Announcement bar",
            value: bannerLive ? "On" : "Off",
            detail: `${banner.announcements.length} ${banner.announcements.length === 1 ? "message" : "messages"}`,
            href: "#announcements",
            icon: STATUS_ICONS.banner,
            tone: bannerLive ? "ok" : "muted",
          },
          {
            label: "Business details",
            value: missing === 0 ? "Complete" : `${missing} missing`,
            detail:
              missing === 0
                ? "Shown on legal pages"
                : "Required before taking orders",
            href: "/admin/business",
            icon: STATUS_ICONS.business,
            tone: missing === 0 ? "ok" : "warn",
          },
        ]}
      />

      <SettingsSection
        id="appearance"
        title="Appearance"
        description="Colours, type and shapes for the whole storefront. Pick a theme, then change its headline font or corners if you like. Choosing previews it on this page; save to show it to shoppers."
      >
        <AppearanceSettings initial={appearance} />
      </SettingsSection>

      <SettingsSection
        id="announcements"
        title="Announcement bar"
        description="Short messages that scroll across the top of every shop page, in order. Turn it off to hide it without losing them."
      >
        <AnnouncementSettings
          initial={banner.announcements}
          initialEnabled={banner.enabled}
        />
      </SettingsSection>

      <SettingsSection
        title="Business details"
        description="Your name, business ID, address and contact email now have their own page."
      >
        <Link
          href="/admin/business"
          className="flex items-center justify-between rounded-panel border border-border bg-card px-5 py-4 text-[0.8125rem] transition-colors hover:border-foreground/30"
        >
          <span>
            {missing === 0
              ? `${business.business_name} · Y-tunnus ${business.business_id}`
              : "Add your business details"}
          </span>
          <span className="text-muted-foreground">Open →</span>
        </Link>
      </SettingsSection>
    </>
  );
}
