import type { Request, Response } from "express";
import type { ErrorCode, ValidationCode } from "@repo/types";
import { rlog } from "../log";

// Every response is { success, message?, code?, errors?, data?, meta? }.
// Empty fields are left out, as the Go API's omitempty did.

export interface AppError {
  code: ValidationCode;
  field?: string;
  message: string;
}

export interface PaginationMeta {
  total: number;
  total_pages: number;
  page: number;
  limit: number;
  offset: number;
}

/** The meta block for one page of `limit` items. */
export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    total,
    total_pages: Math.ceil(total / limit),
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

/** A successful response; data and meta are left out when undefined. */
export function ok(
  res: Response,
  status: number,
  message: string,
  data?: unknown,
  meta?: unknown,
) {
  const body: Record<string, unknown> = { success: true, message };
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;
  res.status(status).json(body);
}

/** A failed response with a machine-readable code. */
export function fail(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
) {
  res.status(status).json({ success: false, message, code });
}

/** A 400 listing what was wrong with each field. */
export function validationFailed(
  res: Response,
  errors: AppError[],
  message = "Invalid request body",
) {
  res
    .status(400)
    .json({ success: false, message, code: "VALIDATION_FAILED", errors });
}

/**
 * Logs err and sends the generic 500, so internals never reach the client.
 */
export function internal(
  req: Request,
  res: Response,
  msg: string,
  err: unknown,
  extra?: Record<string, unknown>,
) {
  rlog.error(req, msg, err, extra);
  fail(res, 500, "INTERNAL_SERVER_ERROR", "Failed to process request");
}

/**
 * Columns that never leave the API, whichever row they are in (the Go
 * structs tagged them json:"-"): password hashes, and the restock
 * bookkeeping on order lines.
 */
const PRIVATE_KEYS = new Set(["password_hash", "stock_shortfall"]);

/** JSON replacer for res.json (app.set("json replacer")). */
export function jsonReplacer(key: string, value: unknown) {
  return PRIVATE_KEYS.has(key) ? undefined : value;
}
