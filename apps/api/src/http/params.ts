import type { Request, Response } from "express";
import type { ErrorCode } from "@repo/types";
import { rlog } from "../log";
import { fail } from "./response";

// Path ids, pagination and sorting, read the same way on every route. Each
// helper sends the 400 itself and returns null on bad input, so a handler
// only has to `if (x === null) return;`.

// A UUID in its canonical 8-4-4-4-12 form, in either case.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s: string) => UUID.test(s);

/**
 * The path parameter `param` as a UUID (lowercased), or null after a 400
 * with `code` and the message "Invalid <label>".
 */
export function pathUuid(
  req: Request,
  res: Response,
  param: string,
  code: ErrorCode,
  label: string,
): string | null {
  const value = String(req.params[param] ?? "");
  if (!isUuid(value)) {
    rlog.warn(req, "invalid path id", { param, value });
    fail(res, 400, code, `Invalid ${label}`);
    return null;
  }
  return value.toLowerCase();
}

/** The authenticated user's id (requireAuth ran first). */
export function userId(req: Request): string {
  if (!req.auth) throw new Error("userId called without requireAuth");
  return req.auth.userId;
}

/** A query parameter as one string ("" when absent; the first when repeated). */
export function query(req: Request, name: string): string {
  const v = req.query[name];
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

/** Bounds the page query parameter so offsets stay within int32. */
export const MAX_PAGE = 100_000;

function failPage(res: Response) {
  fail(res, 400, "INVALID_PAGE_PARAMETER", "Invalid page parameter");
}

/** The optional page query parameter (default 1), or null after a 400. */
export function parsePage(req: Request, res: Response): number | null {
  const raw = req.query.page === undefined ? "1" : query(req, "page");
  const page = /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    failPage(res);
    return null;
  }
  return page;
}

/**
 * Rejects a page past the last one. An empty result still has page 1, so
 * clients can always ask for the first page.
 */
export function checkPageInRange(
  res: Response,
  page: number,
  total: number,
  limit: number,
): boolean {
  if (page > Math.max(Math.ceil(total / limit), 1)) {
    failPage(res);
    return false;
  }
  return true;
}

/** The row offset of `page` for a page size of `limit`. */
export const offset = (page: number, limit: number) => (page - 1) * limit;

export interface Sort {
  field: string;
  dir: "asc" | "desc";
}

/**
 * The optional sort and dir query parameters. sort must be one of `fields`
 * (fallback when absent); dir is asc or desc and defaults to the field's
 * natural direction. Null after a 400.
 */
export function parseSort(
  req: Request,
  res: Response,
  fields: Record<string, "asc" | "desc">,
  fallback: string,
): Sort | null {
  const field = req.query.sort === undefined ? fallback : query(req, "sort");
  const natural = Object.hasOwn(fields, field) ? fields[field] : undefined;
  if (!natural) {
    fail(
      res,
      400,
      "INVALID_QUERY_PARAMETER",
      `sort must be one of ${Object.keys(fields).sort().join(", ")}`,
    );
    return null;
  }
  const dir = req.query.dir === undefined ? natural : query(req, "dir");
  if (dir !== "asc" && dir !== "desc") {
    fail(res, 400, "INVALID_QUERY_PARAMETER", "dir must be asc or desc");
    return null;
  }
  return { field, dir };
}
