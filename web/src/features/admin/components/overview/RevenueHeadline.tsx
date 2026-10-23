import { Panel } from "@/components/app-shell/Panel";
import { RevenueChart } from "@/features/admin/components/revenue-chart/RevenueChart";
import { periodDelta } from "@/features/admin/overview-math";
import type { Overview } from "@/features/admin/types";
import { formatPrice } from "@/lib/format";

export function RevenueHeadline({ overview }: { overview: Overview }) {
  const { current, previous, days } = overview;
  return (
    <Panel>
      <h2 className="text-sm text-muted-foreground">Revenue, last 30 days</h2>
      <p className="mt-2 text-5xl font-semibold tracking-tight">{formatPrice(current.revenueCents)}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {periodDelta(current.revenueCents, previous.revenueCents)} · VAT included
      </p>
      <div className="mt-8">
        <RevenueChart days={days} />
      </div>
    </Panel>
  );
}
