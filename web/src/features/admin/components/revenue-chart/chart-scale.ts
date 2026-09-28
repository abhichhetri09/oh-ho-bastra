import { formatDay, formatDayShort } from "@/lib/format";

export type Day = { date: string; revenueCents: number; orders: number };

export const HEIGHT = 220;
export const MARGIN = { top: 24, right: 8, bottom: 28, left: 56 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

// Clean tick values (1/2/2.5/5 × 10ⁿ), topping out at the first tick above the peak.
export function niceTicks(maxEuros: number) {
  if (maxEuros <= 0) {
    return [0, 25, 50, 75, 100];
  }
  const raw = maxEuros / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw)! * magnitude;
  const count = Math.ceil(maxEuros / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

// Column with a rounded data end and a square baseline.
export function columnPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(RADIUS, width / 2, height);
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join("");
}

// Parsed at midday so the calendar day never shifts with the viewer's timezone.
export const shortDate = (iso: string) => formatDayShort(`${iso}T12:00:00`);
export const longDate = (iso: string) => formatDay(`${iso}T12:00:00`);

/** All geometry for a given width, so the component only draws. */
export function layout(days: Day[], width: number) {
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotW / days.length;
  const barW = Math.max(Math.min(MAX_BAR, band - GAP), 1);
  const ticks = niceTicks(Math.max(...days.map((d) => d.revenueCents)) / 100);
  const max = ticks[ticks.length - 1];
  const y = (cents: number) => MARGIN.top + plotH - (cents / 100 / max) * plotH;
  const bandX = (i: number) => MARGIN.left + i * band;
  const barX = (i: number) => bandX(i) + (band - barW) / 2;
  const peak = days.reduce(
    (best, d, i) => (d.revenueCents > (days[best]?.revenueCents ?? 0) ? i : best),
    -1,
  );
  // About five date labels, always including the last day.
  const labelEvery = Math.ceil(days.length / 5);
  const showDate = (i: number) => (days.length - 1 - i) % labelEvery === 0;
  return { plotW, plotH, band, barW, ticks, y, bandX, barX, peak, showDate };
}
