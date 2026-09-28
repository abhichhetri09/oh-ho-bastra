/** Parses "29", "29,90" or "29.90" to cents; null when not a valid amount. */
export function parseEuros(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : null;
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
