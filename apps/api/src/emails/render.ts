import type { Order, OrderItem } from "../db/gen";
import { queryEscape } from "./escape";
import { EMAIL_KINDS, type EmailKind } from "./outbox";
import {
  orderHtml,
  orderText,
  resetHtml,
  resetText,
  type OrderView,
} from "./templates";

/** Signs the emails; it matches the storefront's wordmark. */
export const STORE_NAME = "Oh Ho Bastra";

/** An email ready to send. */
export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/** What each kind of email says around the order. */
interface Copy {
  subject: (label: string) => string;
  preheader: string; // the inbox preview line
  heading: string;
  intro: string;
}

const COPIES: Record<EmailKind, Copy> = {
  order_confirmed: {
    subject: (label) => `Your order ${label} is confirmed`,
    preheader: "Thank you for your order. We'll let you know when it ships.",
    heading: "Thank you for your order",
    intro:
      "We've received your payment and are getting your order ready. We'll email you again as soon as it ships.",
  },
  order_shipped: {
    subject: (label) => `Your order ${label} is on its way`,
    preheader: "Your order has left the studio.",
    heading: "Your order is on its way",
    intro:
      "Good news: your order has left the studio and is on its way to you.",
  },
  order_refunded: {
    subject: (label) => `Your order ${label} has been refunded`,
    preheader: "Your refund is on its way back to you.",
    heading: "Your order has been refunded",
    intro:
      "We've refunded your order in full to your original payment method. Depending on your bank, it can take 5–10 business days to appear.",
  },
};

export const isEmailKind = (kind: string): kind is EmailKind =>
  (EMAIL_KINDS as readonly string[]).includes(kind);

/** The order fields an email shows. */
export type EmailOrder = Pick<
  Order,
  | "number"
  | "subtotal"
  | "shipping"
  | "total"
  | "currency"
  | "shipping_address"
  | "tracking_number"
> & { created_at: Date | null };

export type EmailItem = Pick<
  OrderItem,
  "product_name" | "options" | "quantity" | "line_total" | "image"
>;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Builds the email of the given kind for an order; throws on an unknown kind. */
export function render(
  kind: string,
  order: EmailOrder,
  customerName: string,
  items: EmailItem[] | null,
  frontendUrl: string,
): Rendered {
  if (!isEmailKind(kind))
    throw new Error(`unknown email kind ${JSON.stringify(kind)}`);
  const c = COPIES[kind];

  const label = orderLabel(order.number);
  const placed = order.created_at;
  const view: OrderView = {
    storeName: STORE_NAME,
    preheader: c.preheader,
    heading: c.heading,
    intro: c.intro,
    greeting: greeting(customerName),
    label,
    placedOn: placed
      ? `${placed.getUTCDate()} ${MONTHS[placed.getUTCMonth()]} ${String(placed.getUTCFullYear()).padStart(4, "0")}`
      : "",
    url: frontendUrl + "/account/orders/" + label,
    shopUrl: frontendUrl,
    items: (items ?? []).map((it) => ({
      name: it.product_name,
      options: optionValues(it.options),
      quantity: it.quantity,
      lineTotal: formatMoney(it.line_total, order.currency),
      image: thumbnail(it.image),
    })),
    subtotal: formatMoney(order.subtotal, order.currency),
    shipping:
      order.shipping === 0
        ? "Free"
        : formatMoney(order.shipping, order.currency),
    total: formatMoney(order.total, order.currency),
    tracking:
      kind === "order_shipped" && order.tracking_number !== null
        ? order.tracking_number
        : "",
    address: addressLines(order.shipping_address),
  };
  return {
    subject: c.subject(label),
    html: orderHtml(view),
    text: orderText(view),
  };
}

/**
 * The "reset your password" email. The token goes in the link only; it's
 * never stored or logged.
 */
export function renderPasswordReset(
  name: string,
  token: string,
  frontendUrl: string,
): Rendered {
  const shop = frontendUrl.replace(/\/+$/, "");
  const view = {
    storeName: STORE_NAME,
    greeting: greeting(name),
    url: shop + "/auth/reset?token=" + queryEscape(token),
    shopUrl: shop,
  };
  return {
    subject: `Reset your ${STORE_NAME} password`,
    html: resetHtml(view),
    text: resetText(view),
  };
}

/** The customer-facing order number, as the storefront shows it. */
export const orderLabel = (number: number) => `OHB-${number}`;

const CURRENCY_SYMBOLS: Record<string, string> = { eur: "€", usd: "$" };

/** Formats minor units: 123456 eur → "€1,234.56". */
export function formatMoney(cents: number, currency: string): string {
  let sign = "";
  if (cents < 0) [sign, cents] = ["-", -cents];
  const whole = Math.trunc(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+$)/g, ",");
  const amount = `${whole}.${String(cents % 100).padStart(2, "0")}`;
  const symbol = Object.hasOwn(CURRENCY_SYMBOLS, currency.toLowerCase())
    ? CURRENCY_SYMBOLS[currency.toLowerCase()]
    : undefined;
  return symbol !== undefined
    ? sign + symbol + amount
    : `${sign}${amount} ${currency.toUpperCase()}`;
}

/** Go's strings.TrimSpace (unicode.IsSpace), which differs a little from String.trim. */
// \t \n \v \f \r, space, NEL, NBSP, and the other Unicode White_Space.
const SPACE =
  "[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
const EDGE_SPACE = new RegExp(`^${SPACE}+|${SPACE}+$`, "g");
const trimSpace = (s: string) => s.replace(EDGE_SPACE, "");

/** "Hi Ada," from the first word of the name, or "Hi,". */
export function greeting(name: string): string {
  const first = trimSpace(name).split(" ", 1)[0];
  return first ? `Hi ${first},` : "Hi,";
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Decodes a JSON object into string fields the way encoding/json fills a Go
 * struct: keys match case-insensitively, null leaves a field empty, any
 * other non-string fails the whole decode (null).
 */
function stringFields<K extends string>(
  v: unknown,
  fields: readonly K[],
): Record<K, string> | null {
  if (v === null)
    return Object.fromEntries(fields.map((f) => [f, ""])) as Record<K, string>;
  if (!isObject(v)) return null;
  const out = Object.fromEntries(fields.map((f) => [f, ""])) as Record<
    K,
    string
  >;
  let ok = true;
  for (const [key, value] of Object.entries(v)) {
    const field =
      fields.find((f) => f === key) ??
      fields.find((f) => f.toLowerCase() === key.toLowerCase());
    if (!field || value === null) continue;
    if (typeof value === "string") out[field] = value;
    else ok = false;
  }
  return ok ? out : null;
}

/** Joins an order item's option snapshot: "Black / M". */
export function optionValues(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const values: string[] = [];
  for (const o of raw) {
    const opt = stringFields(o, ["value"] as const);
    if (!opt) return "";
    if (opt.value !== "") values.push(opt.value);
  }
  return values.join(" / ");
}

const COUNTRY_NAMES: Record<string, string> = {
  FI: "Finland",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  AU: "Australia",
  NZ: "New Zealand",
  NP: "Nepal",
  IN: "India",
  JP: "Japan",
};

const ADDRESS_FIELDS = [
  "full_name",
  "phone",
  "line1",
  "line2",
  "city",
  "region",
  "postal_code",
  "country",
] as const;

/** Lays out the order's shipping address snapshot; null when it isn't one. */
export function addressLines(raw: unknown): string[] | null {
  const a = stringFields(raw, ADDRESS_FIELDS);
  if (!a) return null;
  // "London NW1 6XE", "Austin, TX 78701": as the storefront writes it.
  const city = nonEmpty(
    nonEmpty(a.city, a.region).join(", "),
    a.postal_code,
  ).join(" ");
  const country =
    (Object.hasOwn(COUNTRY_NAMES, a.country) ? COUNTRY_NAMES[a.country] : "") ||
    a.country;
  return nonEmpty(a.full_name, a.line1, a.line2, city, country);
}

const nonEmpty = (...parts: string[]) =>
  parts.map(trimSpace).filter((p) => p !== "");

/**
 * Asks Cloudinary for a small JPEG of a product image (Outlook can't show
 * WebP or AVIF); other URLs are used as they are.
 */
export function thumbnail(url: string): string {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/"))
    return url;
  return url.replace(
    "/image/upload/",
    "/image/upload/c_fill,g_auto,w_128,h_160,f_jpg,q_auto/",
  );
}
