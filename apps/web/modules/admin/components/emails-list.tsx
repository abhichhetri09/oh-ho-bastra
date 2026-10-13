"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { AdminEmail, EmailStatus } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminRetryEmail } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { orderLabel } from "@/modules/checkout/lib/orders";
import { formatDateTime } from "../lib/datetime";
import {
  adminEmailsSearch,
  type AdminEmailFilters,
} from "../lib/order-filters";
import { adminKeys } from "../keys";
import { useAdminEmails } from "../queries";
import { PageNav } from "./page-nav";

const PATH = "/admin/emails";

const tabs: { label: string; status: EmailStatus | "" }[] = [
  { label: "All", status: "" },
  { label: "Failed", status: "failed" },
  { label: "Waiting", status: "pending" },
  { label: "Sent", status: "sent" },
];

const kinds: Record<AdminEmail["kind"], string> = {
  order_confirmed: "Order confirmed",
  order_shipped: "Order shipped",
  order_refunded: "Order refunded",
};

const tone: Record<EmailStatus, string> = {
  pending: "border-border text-muted-foreground",
  sent: "border-success/40 text-success",
  failed: "border-destructive/40 text-destructive",
};

/**
 * The order emails the store sends, newest first. One that failed (the
 * sender gave up after its retries) can be sent again.
 */
export function EmailsList({ initial }: { initial: AdminEmailFilters }) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(initial);
  const emails = useAdminEmails(filters);

  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminEmailsSearch(filters));
  }, [filters]);

  const outOfRange =
    emails.isError &&
    getApiError(emails.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await adminRetryEmail({
        path: { emailID: id },
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: async () => {
      toast.success("Queued again. It goes out within a minute.");
      const keys: QueryKey[] = [
        adminKeys.emails(),
        adminKeys.counts(),
        adminKeys.stats(),
      ];
      await Promise.all(
        keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error) => {
      toast.error(getApiError(error)?.message ?? "Couldn't queue the email.");
      // Someone else may have sent it again already.
      void queryClient.invalidateQueries({ queryKey: adminKeys.emails() });
    },
  });

  const rows = emails.data?.data.rows ?? [];
  const counts = emails.data?.data.counts;
  const meta = emails.data?.meta;

  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Email status"
        className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab) => {
          const n = counts
            ? tab.status
              ? counts[tab.status]
              : counts.pending + counts.sent + counts.failed
            : null;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={filters.status === tab.status}
              onClick={() =>
                setFilters((f) => ({ ...f, status: tab.status, page: 1 }))
              }
              className="-mb-px shrink-0 border-b-2 border-transparent px-3 pb-3 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
            >
              {tab.label}
              {n !== null && (
                <span
                  className={cn(
                    "ml-1.5 font-mono text-[0.625rem] tabular-nums",
                    tab.status === "failed" && n > 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          emails.isPlaceholderData && "opacity-60",
        )}
      >
        {emails.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : emails.isError && !outOfRange ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              The emails couldn&apos;t load.
            </p>
            <Button variant="outline" onClick={() => emails.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-serif text-2xl">
              {filters.status === "failed"
                ? "No failed emails."
                : "No emails here."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {filters.status === "failed"
                ? "Every email that was due has gone out."
                : "Order confirmations, shipping and refund emails appear here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((e) => (
              <li
                key={e.id}
                className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                    <span className="font-medium">{kinds[e.kind]}</span>
                    <Link
                      href={`/admin/orders/${e.order_number}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {orderLabel(e.order_number)}
                    </Link>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center border px-1.5 font-mono text-[0.5625rem] tracking-[0.14em] uppercase",
                        tone[e.status],
                      )}
                    >
                      {e.status === "pending" ? "waiting" : e.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    To {e.email} ·{" "}
                    {e.status === "sent" && e.sent_at
                      ? `sent ${formatDateTime(e.sent_at)}`
                      : `queued ${formatDateTime(e.requeued_at ?? e.created_at)}`}
                    {e.attempts > 0 &&
                      ` · ${e.attempts} ${e.attempts === 1 ? "try" : "tries"}`}
                  </p>
                  {e.last_error && e.status !== "sent" && (
                    <p className="mt-1 line-clamp-2 font-mono text-[0.6875rem] break-all text-destructive/90">
                      {e.last_error}
                    </p>
                  )}
                </div>
                {e.status === "failed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-self-start sm:justify-self-end"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(e.id)}
                  >
                    <ArrowClockwiseIcon data-icon="inline-start" />
                    {retry.isPending && retry.variables === e.id
                      ? "Queuing…"
                      : "Send again"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(page) => PATH + adminEmailsSearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
