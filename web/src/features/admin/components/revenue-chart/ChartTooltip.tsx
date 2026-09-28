import { formatPrice, plural } from "@/lib/format";
import { longDate, type Day } from "./chart-scale";

const WIDTH = 176;

export function ChartTooltip({ day, x, y, chartWidth }: { day: Day; x: number; y: number; chartWidth: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 w-44 rounded-lg border bg-background p-3 text-sm shadow-sm"
      style={{
        left: Math.min(Math.max(x - WIDTH / 2, 0), chartWidth - WIDTH),
        top: Math.max(y - 84, 0),
      }}
    >
      <p className="text-xs text-muted-foreground">{longDate(day.date)}</p>
      <p className="mt-1 font-medium tabular-nums">{formatPrice(day.revenueCents)}</p>
      <p className="text-xs text-muted-foreground">{plural(day.orders, "paid order")}</p>
    </div>
  );
}
