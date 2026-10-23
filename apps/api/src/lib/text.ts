import { randomInt, randomUUID } from "node:crypto";

/** "Heavyweight Tee — Black" → "heavyweight-tee-black". */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Length of the "-xxxxxxx" suffix slugWithSuffix adds. */
const SLUG_SUFFIX_LEN = 8;

/** base plus a random 7-character suffix, for a slug that's taken. */
export function slugWithSuffix(base: string): string {
  let suffix = "";
  for (let i = 0; i < SLUG_SUFFIX_LEN - 1; i++)
    suffix += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return `${base}-${suffix}`;
}

/**
 * Whether current is base, or base plus a slugWithSuffix suffix, so a record
 * whose name still slugifies to base keeps its URL.
 */
export function slugMatches(current: string, base: string): boolean {
  if (current === base) return true;
  return (
    current.length === base.length + SLUG_SUFFIX_LEN &&
    current.startsWith(base + "-")
  );
}

/** The first n characters (code points), never splitting one. */
const firstChars = (s: string, n: number) => [...s].slice(0, n).join("");

/** "Heavyweight Tee", ["M", "Black"] → "HEA-M-BLA-1A2B3C4D-5E6F". */
export function generateSku(
  productName: string,
  variantOptions: string[],
): string {
  const prefix =
    firstChars(productName.trim(), 3).replaceAll(" ", "").toUpperCase() ||
    "SKU";
  const suffix = variantOptions
    .filter((o) => o.length > 0)
    .map((o) => firstChars(o, 3).toUpperCase())
    .join("-");
  const random = randomUUID().slice(0, 13).toUpperCase();
  return suffix ? `${prefix}-${suffix}-${random}` : `${prefix}-${random}`;
}

/**
 * An ILIKE pattern matching s anywhere, with s taken literally: its % and _
 * are escaped (backslash is Postgres' default LIKE escape).
 */
export function containsPattern(s: string): string {
  return "%" + s.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
}
