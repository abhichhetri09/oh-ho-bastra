import { formatPrice } from "@/lib/format";
import { longDate, type Day } from "./chart-scale";

/** Accessible table view of the chart data, newest first. */
export function RevenueTable({ days }: { days: Day[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show as table</summary>
      <table className="mt-3 w-full text-left tabular-nums">
        <thead className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="py-2 font-normal">Day</th>
            <th className="py-2 text-right font-normal">Paid orders</th>
            <th className="py-2 text-right font-normal">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y border-y">
          {[...days].reverse().map((d) => (
            <tr key={d.date}>
              <td className="py-1.5">{longDate(d.date)}</td>
              <td className="py-1.5 text-right">{d.orders}</td>
              <td className="py-1.5 text-right">{formatPrice(d.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
