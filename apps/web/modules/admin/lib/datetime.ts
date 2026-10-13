const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An ISO timestamp as a datetime-local input's value ("2026-10-12T18:30"),
 * in the browser's time zone, which is what the input shows and edits.
 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value back to an ISO timestamp; undefined when empty or invalid. */
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12 Oct, 14:05" in the browser's time zone (client-rendered data only). */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
