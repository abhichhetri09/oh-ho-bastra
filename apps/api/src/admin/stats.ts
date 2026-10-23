import type { AdminOrdersByStatusRow } from "../db/gen";
import { ORDER_STATUSES } from "./filters";

/** LowStockThreshold: active variants at or below it are flagged. */
export const LOW_STOCK_THRESHOLD = 5;

/** statsRanges are the dashboard's periods, in days ending today (UTC). */
export const STATS_RANGES: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const DEFAULT_STATS_RANGE = "30d";

/** period is [from, to): whole days ending with today (UTC). */
export interface Period {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (d: Date, days: number) =>
  new Date(d.getTime() + days * DAY_MS);

export function periods(
  now: Date,
  days: number,
): { current: Period; previous: Period } {
  const to = addDays(new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS), 1);
  const from = addDays(to, -days);
  return {
    current: { from, to },
    previous: { from: addDays(from, -days), to: from },
  };
}

/**
 * statusCounts has every order status, 0 when there are none. Keys are
 * sorted, as Go wrote a map.
 */
export function statusCounts(
  rows: AdminOrdersByStatusRow[],
): Record<string, number> {
  const counts = new Map<string, number>(ORDER_STATUSES.map((s) => [s, 0]));
  for (const r of rows) counts.set(r.status, r.count);
  return Object.fromEntries(
    [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
