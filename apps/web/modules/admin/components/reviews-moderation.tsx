"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import type { AdminReview, ReviewStatus } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSetReviewStatus } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import { Stars } from "@/modules/reviews/components/stars";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import {
  adminReviewsSearch,
  type AdminReviewFilters,
} from "../lib/order-filters";
import { useAdminReviews } from "../queries";
import { PageNav } from "./page-nav";

const PATH = "/admin/reviews";

const tabs: { label: string; status: ReviewStatus | "" }[] = [
  { label: "All", status: "" },
  { label: "Published", status: "published" },
  { label: "Hidden", status: "hidden" },
];

const ratingItems = [
  { value: "all", label: "Any rating" },
  ...[5, 4, 3, 2, 1].map((n) => ({
    value: String(n),
    label: `${n} ${n === 1 ? "star" : "stars"}`,
  })),
];

/** Every review, newest first, to publish or hide. */
export function ReviewsModeration({
  initial,
}: {
  initial: AdminReviewFilters;
}) {
  const [filters, setFilters] = useState(initial);
  const reviews = useAdminReviews(filters);

  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminReviewsSearch(filters));
  }, [filters]);

  const outOfRange =
    reviews.isError &&
    getApiError(reviews.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  const rows = reviews.data?.data ?? [];
  const meta = reviews.data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label="Review status" className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              aria-pressed={filters.status === tab.status}
              onClick={() =>
                setFilters((f) => ({ ...f, status: tab.status, page: 1 }))
              }
              className="-mb-px border-b-2 border-transparent px-3 pb-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pb-3">
          <Select
            value={filters.rating === null ? "all" : String(filters.rating)}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                rating: !value || value === "all" ? null : Number(value),
                page: 1,
              }))
            }
            items={ratingItems}
          >
            <SelectTrigger aria-label="Rating" className="h-9 w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ratingItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {meta
          ? `${meta.total} ${meta.total === 1 ? "review" : "reviews"}`
          : " "}
      </p>

      {reviews.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : reviews.isError && !outOfRange ? (
        <div className="rounded-panel border border-border p-8 text-sm text-muted-foreground">
          The reviews couldn&apos;t load.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => reviews.refetch()}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-panel border border-border px-5 py-16 text-center">
          <p className="font-serif text-2xl">No reviews here.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Reviews from customers who bought a product appear here as they are
            written.
          </p>
        </div>
      ) : (
        <ul
          className={cn(
            "space-y-3 transition-opacity",
            reviews.isPlaceholderData && "opacity-60",
          )}
        >
          {rows.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(page) => PATH + adminReviewsSearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: AdminReview }) {
  const queryClient = useQueryClient();
  const hidden = review.status === "hidden";

  const toggle = useAdminMutation({
    mutationFn: async (status: ReviewStatus) => {
      const { data } = await adminSetReviewStatus({
        path: { id: review.id },
        body: { status },
        throwOnError: true,
      });
      return data.data;
    },
    success: (_, status) =>
      status === "hidden"
        ? "Hidden from the store; the rating no longer counts it"
        : "Published again",
    failure: "Couldn't update the review.",
    invalidate: [adminKeys.reviews(), adminKeys.stats(), adminKeys.customers()],
    onSuccess: (updated) => {
      // Show the new status at once, in every cached page.
      queryClient.setQueriesData<{ data: AdminReview[] }>(
        { queryKey: adminKeys.reviews() },
        (page) =>
          page && {
            ...page,
            data: page.data.map((r) => (r.id === updated.id ? updated : r)),
          },
      );
    },
  });

  return (
    <li
      className={cn(
        "rounded-panel border border-border bg-card p-5 transition-colors",
        hidden && "bg-muted/40",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Stars value={review.rating} />
            {hidden && (
              <span className="inline-flex h-5 items-center border border-border px-1.5 font-mono text-[0.5625rem] tracking-[0.14em] text-muted-foreground uppercase">
                Hidden
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-[0.9375rem] font-medium",
              hidden && "text-muted-foreground",
            )}
          >
            {review.title}
          </p>
          <p
            className={cn(
              "max-w-prose text-[0.8125rem] leading-relaxed whitespace-pre-line",
              hidden ? "text-muted-foreground" : "text-foreground/85",
            )}
          >
            {review.body}
          </p>
          <p className="text-xs text-muted-foreground">
            {review.author_name} ·{" "}
            <a
              href={`mailto:${review.author_email}`}
              className="hover:underline"
            >
              {review.author_email}
            </a>{" "}
            · {formatOrderDate(review.created_at)} · on{" "}
            <Link
              href={`/products/${review.product_slug}#reviews`}
              target="_blank"
              className="text-foreground hover:underline"
            >
              {review.product_name}
            </Link>
          </p>
        </div>
        <Button
          variant={hidden ? "default" : "outline"}
          size="sm"
          className="shrink-0 self-start"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(hidden ? "published" : "hidden")}
        >
          {hidden ? (
            <EyeIcon data-icon="inline-start" />
          ) : (
            <EyeSlashIcon data-icon="inline-start" />
          )}
          {toggle.isPending ? "Saving…" : hidden ? "Publish" : "Hide"}
        </Button>
      </div>
    </li>
  );
}
