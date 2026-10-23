/** "+12 % vs previous 30 days", with sensible wording when there's no baseline. */
export function periodDelta(current: number, previous: number, days = 30) {
  const period = `previous ${days} days`;
  if (previous === 0) {
    return current === 0 ? `No change vs ${period}` : `No sales in the ${period}`;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return `${sign}${Math.abs(pct)} % vs ${period}`;
}
