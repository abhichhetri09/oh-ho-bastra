import type { StatsRange } from "@repo/types";

export const STATS_RANGES: {
  value: StatsRange;
  label: string;
  days: number;
}[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
];

export const DEFAULT_STATS_RANGE: StatsRange = "30d";

/** ?range= from the URL; anything unknown is the default. */
export function parseStatsRange(
  value: string | string[] | undefined,
): StatsRange {
  const v = Array.isArray(value) ? value[0] : value;
  return STATS_RANGES.find((r) => r.value === v)?.value ?? DEFAULT_STATS_RANGE;
}

export function rangeDays(range: StatsRange): number {
  return STATS_RANGES.find((r) => r.value === range)?.days ?? 30;
}

export type Change =
  | { kind: "none" } // nothing in either period
  | { kind: "new" } // something now, nothing before
  | { kind: "up" | "down" | "flat"; percent: number };

/** How a figure moved against the previous period, in whole percent. */
export function change(current: number, previous: number): Change {
  if (previous === 0) return current === 0 ? { kind: "none" } : { kind: "new" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "flat", percent: 0 };
  return { kind: percent > 0 ? "up" : "down", percent: Math.abs(percent) };
}
