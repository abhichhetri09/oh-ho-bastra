import type { AdminExportOrdersRow } from "../db/gen";
import { orderLabel } from "../emails/render";
import { startsWithSpace } from "./filters";

export const EXPORT_HEADER = [
  "order",
  "status",
  "placed_at",
  "paid_at",
  "shipped_at",
  "customer",
  "email",
  "items",
  "subtotal",
  "discount",
  "shipping",
  "total",
  "currency",
  "coupon_code",
  "tracking_number",
  "ship_city",
  "ship_country",
];

/** A field as Go's encoding/csv writes it (comma-separated, \n line ends). */
function csvField(field: string): string {
  if (field === "") return field;
  const quote =
    field === "\\." || /[\n\r",]/.test(field) || startsWithSpace(field);
  return quote ? `"${field.replaceAll('"', '""')}"` : field;
}

/** One record as encoding/csv's Writer.Write writes it. */
export const csvLine = (fields: string[]) =>
  fields.map(csvField).join(",") + "\n";

/** RFC 3339 in UTC to the second, "" for none. */
export const timestamp = (t: Date | null) =>
  t === null ? "" : t.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Go's %02d. */
const twoDigits = (n: number) =>
  n < 0 ? String(n) : String(n).padStart(2, "0");

/** money is cents as "1234.50". */
export const money = (cents: number) =>
  `${Math.trunc(cents / 100)}.${twoDigits(cents % 100)}`;

/**
 * safeCell keeps a spreadsheet from running text as a formula (CSV
 * injection): a cell starting with = + - @, a tab or a carriage return gets
 * a leading apostrophe, which spreadsheets show as text.
 */
export function safeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

export function exportRecord(r: AdminExportOrdersRow): string[] {
  return [
    orderLabel(r.number),
    r.status,
    timestamp(r.created_at),
    timestamp(r.paid_at),
    timestamp(r.shipped_at),
    safeCell(r.customer_name),
    safeCell(r.email),
    String(r.item_count),
    money(r.subtotal),
    money(r.discount),
    money(r.shipping),
    money(r.total),
    r.currency,
    // a code may start with "-"
    safeCell(r.coupon_code ?? ""),
    safeCell(r.tracking_number ?? ""),
    safeCell(r.ship_city),
    r.ship_country,
  ];
}

/** The export's whole file: the header, then one line per order. */
export const exportCsv = (rows: AdminExportOrdersRow[]) =>
  csvLine(EXPORT_HEADER) + rows.map((r) => csvLine(exportRecord(r))).join("");
