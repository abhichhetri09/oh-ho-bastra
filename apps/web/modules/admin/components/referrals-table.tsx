"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HandshakeIcon } from "@phosphor-icons/react";
import type { AdminReferral, ReferralStatus } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiError } from "@/lib/api/errors";
import { formatPriceShort } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import { useAdminReferrals } from "../queries";
import { PageNav } from "./page-nav";

const PATH = "/admin/referrals";
const COLUMNS = 6;

const STATUS: Record<ReferralStatus, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "border-border text-foreground" },
  earned: { label: "Paid out", tone: "border-success/40 text-success" },
  capped: { label: "Over the cap", tone: "border-clay/40 text-clay" },
  cancelled: {
    label: "Cancelled",
    tone: "border-border text-muted-foreground",
  },
};

/** When a referral pays out, or did: a date, or why there isn't one. */
function payout(r: AdminReferral): string {
  if (r.status === "earned" || r.status === "capped")
    return r.settled_at ? formatOrderDate(r.settled_at) : "—";
  if (r.status === "cancelled") return "—";
  return r.payout_at ? formatOrderDate(r.payout_at) : "Once delivered";
}

/**
 * Every referral, newest first: who referred whom, the friend's order and
 * where it is, and when the referrer's credit pays out (or did).
 */
export function ReferralsTable({ initialPage }: { initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  const referrals = useAdminReferrals(page);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      page > 1 ? `${PATH}?page=${page}` : PATH,
    );
  }, [page]);

  const outOfRange =
    referrals.isError &&
    getApiError(referrals.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && page > 1) setPage(1);
  }, [outOfRange, page]);

  const rows = referrals.data?.data ?? [];
  const meta = referrals.data?.meta;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {meta && `${meta.total} ${meta.total === 1 ? "referral" : "referrals"}`}
      </p>
      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          referrals.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Referrer</TableHead>
              <TableHead>Friend</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.isPending ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMNS}>
                    <Skeleton className="h-9" />
                  </TableCell>
                </TableRow>
              ))
            ) : referrals.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The referrals couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => referrals.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMNS} className="py-16 text-center">
                  <HandshakeIcon
                    className="mx-auto size-8 text-muted-foreground"
                    weight="light"
                  />
                  <p className="mt-4 font-serif text-2xl">No referrals yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    A friend&apos;s first order through a customer&apos;s link
                    shows up here.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/admin/customers/${r.referrer_id}`}
                      className="link-underline"
                    >
                      {r.referrer_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.referrer_email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{r.friend_email}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${r.order_number}`}
                      className="link-underline font-mono text-xs"
                    >
                      OHB-{r.order_number}
                    </Link>
                    <p className="text-xs text-muted-foreground capitalize">
                      {r.order_status}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPriceShort(r.reward)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs",
                        STATUS[r.status].tone,
                      )}
                    >
                      {STATUS[r.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {payout(r)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {meta && meta.total_pages > 1 && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(p) => (p > 1 ? `${PATH}?page=${p}` : PATH)}
          onPage={setPage}
        />
      )}
    </div>
  );
}
