import type { Request, Response } from "express";
import { isUuid, parseSort, query, type Sort } from "../http/params";
import { fail } from "../http/response";
import { containsPattern } from "../lib/text";

export const MAX_SEARCH = 100;

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

// Go's unicode.IsSpace: JS's \s without U+FEFF, plus U+0085.
const SPACE =
  "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const EDGE_SPACE = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "g");
const LEADING_SPACE = new RegExp(`^[${SPACE}]`);

/** strings.TrimSpace. */
export const trimSpace = (s: string) => s.replace(EDGE_SPACE, "");

/** Whether s starts with a character unicode.IsSpace accepts. */
export const startsWithSpace = (s: string) => LEADING_SPACE.test(s);

/** utf8.RuneCountInString. */
export const runeCount = (s: string) => [...s].length;

/** The q query parameter trimmed, or null after a 400 when longer than 100 characters. */
export function searchQuery(req: Request, res: Response): string | null {
  const q = trimSpace(query(req, "q"));
  if (runeCount(q) > MAX_SEARCH) {
    fail(
      res,
      400,
      "INVALID_QUERY_PARAMETER",
      "q must be at most 100 characters",
    );
    return null;
  }
  return q;
}

const INT64_MAX = 2n ** 63n - 1n;

/**
 * strconv.ParseInt(s, 10, 64) when it is at least 1, else null. A number
 * past what JS holds exactly can't be an order's (they count up from 1001),
 * so it comes back as 0, which matches no order either.
 */
export function positiveInt64(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = BigInt(s);
  if (n < 1n || n > INT64_MAX) return null;
  return n > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(n);
}

/** orderNumber reads "1042", "OHB-1042" or "#1042". */
export function orderNumber(q: string): number | null {
  let s = q.toUpperCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.startsWith("OHB-")) s = s.slice(4);
  return positiveInt64(s);
}

/** The :number path parameter, or null after a 400. */
export function pathNumber(req: Request, res: Response): number | null {
  const n = positiveInt64(String(req.params.number ?? ""));
  if (n === null)
    fail(res, 400, "INVALID_ORDER_NUMBER", "Invalid order number");
  return n;
}

/** time.Parse(time.DateOnly, s) succeeds: a real calendar day as YYYY-MM-DD. */
function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const days = new Date(Date.UTC(2000, mo, 0)).getUTCDate(); // a leap year
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= (mo === 2 && !leap ? 28 : days);
}

/** orderFilter is the admin orders list's filters and order, shared by the
 * list, the CSV export and the command palette. */
export interface OrderFilter {
  status: string | null;
  number: number | null;
  email_pattern: string | null;
  user_id: string | null;
  from_date: string | null;
  to_date: string | null;
  sort: Sort;
}

/** orderSorts are the sortable fields and their natural direction. */
const ORDER_SORTS = { created: "desc", total: "desc" } as const;

/**
 * orderFilters reads status, q (an order number, "1042", "OHB-1042" or
 * "#1042", or else a piece of the customer's email), customer (a user ID),
 * from and to (placed dates, YYYY-MM-DD in UTC, both included), sort and
 * dir. On failure it writes a 400 and returns null.
 */
export function orderFilters(req: Request, res: Response): OrderFilter | null {
  const f: Omit<OrderFilter, "sort"> = {
    status: null,
    number: null,
    email_pattern: null,
    user_id: null,
    from_date: null,
    to_date: null,
  };
  const status = query(req, "status");
  if (status !== "") {
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        "status must be pending, paid, shipped, delivered, cancelled or refunded",
      );
      return null;
    }
    f.status = status;
  }
  const q = searchQuery(req, res);
  if (q === null) return null;
  const number = orderNumber(q);
  if (number !== null) f.number = number;
  else if (q !== "") f.email_pattern = containsPattern(q);

  const customer = query(req, "customer");
  if (customer !== "") {
    if (!isUuid(customer)) {
      fail(res, 400, "INVALID_QUERY_PARAMETER", "customer must be a user ID");
      return null;
    }
    f.user_id = customer.toLowerCase();
  }
  for (const param of ["from", "to"] as const) {
    const v = query(req, param);
    if (v === "") continue;
    if (!isDate(v)) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        `${param} must be a date (YYYY-MM-DD)`,
      );
      return null;
    }
    f[param === "from" ? "from_date" : "to_date"] = v;
  }
  if (f.from_date && f.to_date && f.to_date < f.from_date) {
    fail(res, 400, "INVALID_QUERY_PARAMETER", "to must not be before from");
    return null;
  }
  const sort = parseSort(req, res, ORDER_SORTS, "created");
  if (sort === null) return null;
  return { ...f, sort };
}
