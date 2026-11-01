"use client";

import Link from "next/link";
import type { MyReferral, ReferralStatus } from "@repo/types";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/money";
import { referralLink, referralPerk } from "@/lib/referrals";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import { useMyReferrals } from "@/modules/checkout/queries";

const STATUS: Record<ReferralStatus, string> = {
  pending: "On its way",
  earned: "Credit paid",
  capped: "Over this month's limit",
  cancelled: "Cancelled",
};

/** Where a referral is, in words: "Credit paid 3 November 2026". */
function referralState(r: MyReferral): string {
  if (r.status === "earned" && r.payout_at)
    return `${STATUS.earned} ${formatOrderDate(r.payout_at)}`;
  if (r.status === "pending")
    return r.payout_at
      ? `Credit due ${formatOrderDate(r.payout_at)}`
      : "Credit due once their order arrives";
  return STATUS[r.status];
}

/**
 * The customer's referral link (with its code), what it gives and gets
 * them, their store credit, and the friends it brought. The page isn't
 * there while the programme is off; the API's 404 says the same here.
 */
export function ReferralsView({ origin }: { origin: string }) {
  const query = useMyReferrals();
  const data = query.data;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="eyebrow animate-rise">Referrals</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Bring a <em>friend.</em>
        </h1>
      </header>

      {query.isPending ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your referrals."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !data ? (
        <EmptyState
          eyebrow="Not running"
          title="Referrals are paused."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Keep shopping
            </Link>
          }
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div className="space-y-4 rounded-panel border border-border p-5">
              <p className="text-lg">{referralPerk(data.rule)}</p>
              <p className="text-[0.8125rem] text-muted-foreground">
                Your friend gets their discount on a first order. Once it has
                arrived and {data.rule.pay_after_days} days have passed, the
                credit is yours to spend here or in store.
              </p>
              <div className="flex items-center gap-2 rounded-control bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {referralLink(origin, data.code)}
                </span>
                <CopyButton
                  value={referralLink(origin, data.code)}
                  label="your referral link"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your code: <span className="font-mono">{data.code}</span>
              </p>
            </div>
            <div className="space-y-1 rounded-panel border border-border p-5">
              <p className="eyebrow">Store credit</p>
              <p className="text-3xl tabular-nums">
                {formatPrice(data.balance)}
              </p>
              <p className="text-xs text-muted-foreground">
                Pays up to {data.rule.credit_max_percent}% of an order.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="eyebrow">Your referrals</h2>
            {data.referrals.length === 0 ? (
              <p className="text-[0.8125rem] text-muted-foreground">
                No friends yet. Share your link and they&apos;ll show up here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-panel border border-border">
                {data.referrals.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm"
                  >
                    <span className="font-mono">{r.friend}</span>
                    <span className="text-muted-foreground">
                      {referralState(r)}
                    </span>
                    <span className="tabular-nums">
                      {formatPrice(r.reward)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
