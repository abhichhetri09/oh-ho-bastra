// Money is written the Finnish way ("29,00 €"); dates and times follow the
// English UI: day first, 24-hour clock ("26 Sept 2026, 21:36").
const MONEY_LOCALE = "fi-FI";
const DATE_LOCALE = "en-GB";

const priceFormatters = new Map<string, Intl.NumberFormat>();

export function formatPrice(cents: number, currency = "EUR") {
  let formatter = priceFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency });
    priceFormatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

const wholeEuros = new Intl.NumberFormat(MONEY_LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEuros(euros: number) {
  return wholeEuros.format(euros);
}

/** "26 Sept 2026" */
export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(DATE_LOCALE, { dateStyle: "medium" });
}

/** "26 Sept 2026, 21:36" */
export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString(DATE_LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

/** "Sat 26 Sept 2026" — for chart tooltips and day lists. */
export function formatDay(value: string | Date) {
  return new Date(value).toLocaleDateString(DATE_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "26 Sept" — compact axis labels. */
export function formatDayShort(value: string | Date) {
  return new Date(value).toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short" });
}

/** "25,5" — plain numbers the same way as money. */
export function formatNumber(value: number) {
  return value.toLocaleString(MONEY_LOCALE);
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
