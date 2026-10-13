import type { Metadata } from "next";
import { site } from "@/lib/site";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { Dashboard } from "@/modules/admin/components/dashboard";
import { parseStatsRange } from "@/modules/admin/lib/stats";

// The layout's title template only reaches child segments, not this page.
export const metadata: Metadata = {
  title: { absolute: `Dashboard · Admin · ${site.name}` },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { range } = await searchParams;
  return (
    <>
      <AdminPageHeader eyebrow="Overview" title="Dashboard" />
      <Dashboard initialRange={parseStatsRange(range)} />
    </>
  );
}
