import type { Metadata } from "next";
import { AdminPageHeader } from "@/modules/admin/components/page-header";
import { ReviewsModeration } from "@/modules/admin/components/reviews-moderation";
import {
  adminReviewsSearch,
  parseAdminReviewFilters,
} from "@/modules/admin/lib/order-filters";

export const metadata: Metadata = { title: "Reviews" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAdminReviewFilters(await searchParams);
  return (
    <>
      <AdminPageHeader
        eyebrow="Customers"
        title="Reviews"
        description="Hidden reviews leave the product page and its rating."
      />
      <ReviewsModeration key={adminReviewsSearch(filters)} initial={filters} />
    </>
  );
}
