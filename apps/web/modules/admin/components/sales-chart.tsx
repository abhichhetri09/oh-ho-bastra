"use client";

import { useState } from "react";
import type { AdminStats } from "@repo/types";
import { formatPrice, formatPriceShort } from "@/lib/money";
import { cn } from "@/lib/utils";

type Day = AdminStats["series"][number];

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "12 Oct", for a UTC calendar day ("2026-10-12"). */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

// The viewBox height; the box itself is sized in CSS (taller on wide
// screens, beside the stacked panels) and the drawing stretches to it.
const HEIGHT = 180;

const plural = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

/**
 * Revenue per day as bars and orders per day as a line (on its own scale),
 * in plain SVG. Hovering a day, or moving with the arrow keys once the chart
 * has focus, shows that day in the summary above; otherwise it shows the
 * whole range (and screen readers get the summary, with the image label).
 */
export function SalesChart({ days, label }: { days: Day[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...days.map((d) => d.orders), 1);
  const revenue = days.reduce((sum, d) => sum + d.revenue, 0);
  const orders = days.reduce((sum, d) => sum + d.orders, 0);
  const shown = active === null ? null : days[active];
  const width = 100 / Math.max(days.length, 1);
  const gap = Math.min(0.3, width * 0.15);
  // The line stays under the top so its peaks don't meet the gridline.
  const y = (n: number) => HEIGHT - (n / maxOrders) * HEIGHT * 0.9;
  const line = days
    .map((d, i) => `${i * width + width / 2},${y(d.orders)}`)
    .join(" ");
  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  function onKeyDown(event: React.KeyboardEvent) {
    const last = days.length - 1;
    const keys: Record<string, number> = {
      ArrowLeft: Math.max((active ?? last + 1) - 1, 0),
      ArrowRight: Math.min((active ?? -1) + 1, last),
      Home: 0,
      End: last,
    };
    if (event.key === "Escape") {
      setActive(null);
    } else if (event.key in keys) {
      event.preventDefault();
      setActive(keys[event.key]!);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div aria-live="polite">
          <p className="eyebrow mb-2">{shown ? formatDay(shown.day) : label}</p>
          <p className="font-serif text-4xl tabular-nums">
            {formatPrice(shown ? shown.revenue : revenue)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {plural(shown ? shown.orders : orders)}
          </p>
        </div>
        <div className="flex gap-4 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-foreground/80" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-clay" />
            Orders
          </span>
        </div>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}: ${formatPrice(revenue)} from ${plural(orders)}. Use the arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
        className="relative h-44 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-4 focus-visible:ring-offset-card xl:h-72"
      >
        {/* Gridlines at the top and half of the revenue scale. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[maxRevenue, maxRevenue / 2, 0].map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-px flex-1 border-t border-dashed border-border" />
              <span className="w-12 text-right font-mono text-[0.625rem] text-muted-foreground tabular-nums">
                {formatPriceShort(Math.round(v / 100) * 100)}
              </span>
            </div>
          ))}
        </div>
        <svg
          className="absolute inset-y-0 left-0 h-full w-[calc(100%-3.5rem)] overflow-visible"
          viewBox={`0 0 100 ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {days.map((d, i) => {
            const h =
              d.revenue > 0
                ? Math.max((d.revenue / maxRevenue) * HEIGHT, 2)
                : 0;
            return (
              <g key={d.day}>
                {/* The full column is the hover target, not just the bar. */}
                <rect
                  x={i * width}
                  y={0}
                  width={width}
                  height={HEIGHT}
                  className={cn(
                    "transition-[fill] duration-150",
                    active === i ? "fill-foreground/5" : "fill-transparent",
                  )}
                  onMouseEnter={() => setActive(i)}
                />
                <rect
                  x={i * width + gap}
                  y={HEIGHT - h}
                  width={Math.max(width - gap * 2, 0.2)}
                  height={h}
                  className={cn(
                    "pointer-events-none transition-[fill] duration-200",
                    active === i
                      ? "fill-foreground"
                      : active === null
                        ? "fill-foreground/80"
                        : "fill-foreground/25",
                  )}
                />
              </g>
            );
          })}
          {orders > 0 && (
            <polyline
              points={line}
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none fill-none stroke-clay"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
      <div className="relative mt-3 mr-14 h-3 font-mono text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">
        {[...new Set(ticks)].map((i, n) => {
          const d = days[i];
          if (!d) return null;
          return (
            <span
              key={d.day}
              className={cn(
                "absolute top-0",
                n === 0 && "left-0",
                n === 1 && "-translate-x-1/2",
                n === 2 && "right-0",
              )}
              style={n === 1 ? { left: `${(i + 0.5) * width}%` } : undefined}
            >
              {formatDay(d.day)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
