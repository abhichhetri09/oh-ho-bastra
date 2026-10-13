import type { Metadata } from "next";
import { EmailsList } from "@/modules/admin/components/emails-list";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import {
  adminEmailsSearch,
  parseAdminEmailFilters,
} from "@/modules/admin/lib/order-filters";

export const metadata: Metadata = { title: "Emails" };

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminEmailFilters(await searchParams);
  return (
    <>
      <AdminPageHeader
        eyebrow="Store"
        title="Emails"
        description="Order emails to customers. The store retries a failed send for a while, then gives up; send it again here."
      />
      {/* Remounts on navigation to another URL, as the orders table does. */}
      <EmailsList key={adminEmailsSearch(filters)} initial={filters} />
    </>
  );
}
