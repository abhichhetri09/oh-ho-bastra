import { useState } from "react";

import { useElementWidth } from "@/hooks/useElementWidth";
import { formatEuros, formatPrice } from "@/lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { columnPath, HEIGHT, layout, longDate, MARGIN, shortDate, type Day } from "./chart-scale";
import { RevenueTable } from "./RevenueTable";

const axisText = "fill-muted-foreground text-[11px] tabular-nums";

export function RevenueChart({ days }: { days: Day[] }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const g = layout(days, width);
  const total = days.reduce((sum, d) => sum + d.revenueCents, 0);
  const peakDay = days[g.peak];
  const summary = `Daily revenue, last ${days.length} days. Total ${formatPrice(total)}.${
    peakDay ? ` Best day ${longDate(peakDay.date)}, ${formatPrice(peakDay.revenueCents)}.` : ""
  }`;

  return (
    <figure className="space-y-3">
      <div ref={wrapRef} className="relative" onMouseLeave={() => setActive(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block overflow-visible">
          {g.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + g.plotW}
                y1={g.y(tick * 100)}
                y2={g.y(tick * 100)}
                className="stroke-border"
                shapeRendering="crispEdges"
              />
              <text x={MARGIN.left - 10} y={g.y(tick * 100)} dy="0.32em" textAnchor="end" className={axisText}>
                {formatEuros(tick)}
              </text>
            </g>
          ))}

          {days.map((d, i) => {
            const top = g.y(d.revenueCents);
            const height = MARGIN.top + g.plotH - top;
            const cx = g.barX(i) + g.barW / 2;
            return (
              <g key={d.date}>
                {height > 0 ? (
                  <path
                    d={columnPath(g.barX(i), top, g.barW, height)}
                    className="fill-foreground transition-opacity"
                    opacity={active === null || active === i ? 1 : 0.35}
                  />
                ) : null}
                {i === g.peak && active === null ? (
                  <text x={cx} y={top - 8} textAnchor="middle" className="fill-foreground text-[11px] font-medium tabular-nums">
                    {formatEuros(d.revenueCents / 100)}
                  </text>
                ) : null}
                {g.showDate(i) ? (
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" className={axisText}>
                    {shortDate(d.date)}
                  </text>
                ) : null}
                {/* Hit target: the full band, taller than the bar. */}
                <rect
                  x={g.bandX(i)}
                  y={MARGIN.top}
                  width={g.band}
                  height={g.plotH}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onTouchStart={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>

        {active !== null && days[active] ? (
          <ChartTooltip
            day={days[active]}
            x={g.bandX(active) + g.band / 2}
            y={g.y(days[active].revenueCents)}
            chartWidth={width}
          />
        ) : null}
      </div>
      <RevenueTable days={days} />
    </figure>
  );
}
