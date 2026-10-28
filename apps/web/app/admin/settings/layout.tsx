import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { SettingsNav } from "@/modules/admin/components/settings-nav";

// Every settings page shares the title and the sub-navigation: a column
// beside the page on wide screens, tabs above it on narrower ones.
export default function AdminSettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Settings"
        description="Who's selling, how the storefront looks and what it tells shoppers, and what delivery costs."
      />
      <div className="grid gap-8 xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-12">
        <SettingsNav />
        <div className="min-w-0 max-w-5xl">{children}</div>
      </div>
    </>
  );
}
