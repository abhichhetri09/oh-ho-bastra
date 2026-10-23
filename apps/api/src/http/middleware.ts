import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import cors from "cors";
import { ACCESS_COOKIE } from "../auth/session";
import { parseAccess } from "../auth/tokens";
import type { Config } from "../config";
import { log, rlog } from "../log";
import { fail, validationFailed } from "./response";

export const REQUEST_ID_HEADER = "X-Request-ID";

/** Bounds a client-supplied request id so it can't bloat logs. */
const MAX_REQUEST_ID_LEN = 128;

/** Short printable ASCII without spaces: no newlines or control characters in logs. */
export const validRequestId = (id: string) =>
  id.length > 0 && id.length <= MAX_REQUEST_ID_LEN && /^[\x21-\x7e]+$/.test(id);

/** Reuses a sane incoming X-Request-ID or mints one, and echoes it. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER) ?? "";
  req.requestId = validRequestId(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
};

/** One line per request, like gin's logger. */
export const accessLog: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    log.info("request", {
      status: res.statusCode,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      ms: Math.round(ms * 10) / 10,
      ip: req.ip,
      request_id: req.requestId,
    });
  });
  next();
};

/** The web app's origin, with credentials so the auth cookies are sent. */
export function corsMiddleware(cfg: Config): RequestHandler {
  const origins = ["http://localhost:3000"];
  if (cfg.frontendUrl) origins.push(cfg.frontendUrl);
  return cors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Origin",
      "Content-Length",
      "Content-Type",
      "Authorization",
      "Accept",
      REQUEST_ID_HEADER,
    ],
    exposedHeaders: ["Content-Length", REQUEST_ID_HEADER],
    maxAge: 12 * 60 * 60,
  });
}

const ROLES = ["customer", "admin"] as const;
type Role = (typeof ROLES)[number];
export const isValidRole = (role: string): role is Role =>
  (ROLES as readonly string[]).includes(role);

/**
 * Accepts a valid access token cookie and records the user on the request.
 * Every failure is a 401, so the client can try a refresh.
 */
export function requireAuth(cfg: Config): RequestHandler {
  return (req, res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== "string" || token === "") {
      rlog.warn(req, "missing access token");
      fail(res, 401, "MISSING_ACCESS_TOKEN", "Missing access token");
      return;
    }
    let claims;
    try {
      claims = parseAccess(token, cfg.jwtAccessSecret);
    } catch (err) {
      rlog.warn(req, "invalid access token", {
        error: err instanceof Error ? err.message : String(err),
      });
      fail(res, 401, "INVALID_ACCESS_TOKEN", "Invalid access token");
      return;
    }
    if (!isValidRole(claims.role)) {
      rlog.warn(req, "invalid role in access token", { role: claims.role });
      fail(res, 401, "INVALID_TOKEN_CLAIMS", "Invalid access token");
      return;
    }
    req.auth = { userId: claims.user_id, role: claims.role };
    next();
  };
}

/** Lets the request through only for one of `roles`. Runs after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const role = req.auth?.role;
    if (role && roles.includes(role)) {
      next();
      return;
    }
    rlog.warn(req, "insufficient permissions", { role });
    fail(res, 403, "FORBIDDEN", "Insufficient permissions");
  };
}

/**
 * The last handler: malformed JSON is the same 400 a bad body gets; anything
 * else is logged and becomes the generic 500.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    rlog.error(req, "error after the response started", err);
    return;
  }
  const type =
    typeof err === "object" && err !== null && "type" in err
      ? err.type
      : undefined;
  if (
    type === "entity.parse.failed" ||
    type === "encoding.unsupported" ||
    type === "charset.unsupported"
  ) {
    rlog.warn(req, "invalid request payload", {
      error: err instanceof Error ? err.message : String(err),
    });
    validationFailed(res, [
      { code: "INVALID_REQUEST", message: "Invalid request body" },
    ]);
    return;
  }
  if (type === "entity.too.large") {
    validationFailed(res, [
      { code: "INVALID_REQUEST", message: "Request body is too large" },
    ]);
    return;
  }
  rlog.error(req, "unhandled error", err);
  fail(res, 500, "INTERNAL_SERVER_ERROR", "Failed to process request");
};
