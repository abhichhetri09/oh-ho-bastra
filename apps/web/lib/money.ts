// Prices travel as integer cents. One currency until checkout decides it.
export const CURRENCY = "EUR";

const formatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: CURRENCY,
});

const wholeFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

export function formatPrice(cents: number): string {
  return formatter.format(cents / 100);
}

/** An amount taken off, with a minus sign: 600 → "−€6.00". */
export function formatDiscount(cents: number): string {
  return "\u2212" + formatPrice(cents);
}

/** Drops ".00" from whole amounts: 2900 → "€29", 2950 → "€29.50". */
export function formatPriceShort(cents: number): string {
  return cents % 100 === 0
    ? wholeFormatter.format(cents / 100)
    : formatter.format(cents / 100);
}

/** Whole percent saved by an offer: (8900, 6900) → 22. */
export function percentOff(selling: number, offer: number): number {
  return selling > 0 ? Math.round(((selling - offer) / selling) * 100) : 0;
}

/** "12.5" → 1250; null for anything that isn't a non-negative amount. */
export function toCents(amount: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return null;
  return Math.round(Number(amount) * 100);
}

/** 1250 → "12.5", for prefilling an amount input. */
export function fromCents(cents: number): string {
  return String(cents / 100);
}
