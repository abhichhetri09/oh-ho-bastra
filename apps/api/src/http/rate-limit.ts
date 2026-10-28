import type { Request, RequestHandler } from "express";
import {
  ipKeyGenerator,
  rateLimit,
  type Options,
  type RateLimitInfo,
} from "express-rate-limit";
import { rlog } from "../log";
import { fail } from "./response";

// Limits on the auth endpoints, against password guessing (one account or
// many), account and guest spam and email flooding, on discount codes,
// against guessing them, and on order lookups, against guessing an
// order's email. Counts live in memory: one API
// instance. With several instances behind a load balancer, give them a
// shared store (express-rate-limit supports Redis) or each counts alone.
//
// Behind a proxy (Render, a load balancer) TRUSTED_PROXIES must be set, or
// every visitor shares the proxy's ip and one bucket.

const MINUTE = 60_000;

/** The client's ip as a limiter key (IPv6 grouped by /56, as recommended). */
const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** The normalised email in the body, so "A@x.com " and "a@x.com" share a count. */
const bodyEmail = (req: Request) =>
  typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";

function limiter(
  name: string,
  options: Pick<Options, "windowMs" | "limit" | "keyGenerator"> & {
    /** Count failures only, so signing in successfully never locks anyone out. */
    failuresOnly?: boolean;
  },
): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: options.keyGenerator,
    skipSuccessfulRequests: options.failuresOnly ?? false,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res, _next, opts) => {
      // Until this key's window resets (the whole window if unknown).
      const reset = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit
        ?.resetTime;
      const ms = reset
        ? Math.max(reset.getTime() - Date.now(), 1000)
        : opts.windowMs;
      const minutes = Math.max(1, Math.ceil(ms / MINUTE));
      rlog.warn(req, "rate limited", { limiter: name });
      res.setHeader("Retry-After", String(Math.ceil(ms / 1000)));
      fail(
        res,
        429,
        "TOO_MANY_REQUESTS",
        `Too many attempts. Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`,
      );
    },
  });
}

export interface AuthLimits {
  /** Failed logins: per ip and account, and per ip across accounts. */
  login: RequestHandler[];
  register: RequestHandler;
  /** New guest sessions, per ip. */
  guest: RequestHandler;
  forgotPassword: RequestHandler;
  resetPassword: RequestHandler;
  /** Wrong current passwords, per signed-in user (runs after requireAuth). */
  changePassword: RequestHandler;
}

/** Fresh limiters (one set per app, so tests don't share counts). */
export function authLimits(enabled = true): AuthLimits {
  if (!enabled) {
    const pass: RequestHandler = (_req, _res, next) => next();
    return {
      login: [pass],
      register: pass,
      guest: pass,
      forgotPassword: pass,
      resetPassword: pass,
      changePassword: pass,
    };
  }
  return {
    login: [
      limiter("login-account", {
        windowMs: 15 * MINUTE,
        limit: 10,
        failuresOnly: true,
        keyGenerator: (req) => `${ip(req)}|${bodyEmail(req)}`,
      }),
      limiter("login-ip", {
        windowMs: 15 * MINUTE,
        limit: 50,
        failuresOnly: true,
        keyGenerator: ip,
      }),
    ],
    register: limiter("register", {
      windowMs: 60 * MINUTE,
      limit: 10,
      keyGenerator: ip,
    }),
    guest: limiter("guest", {
      windowMs: 60 * MINUTE,
      limit: 20,
      keyGenerator: ip,
    }),
    forgotPassword: limiter("forgot-password", {
      windowMs: 15 * MINUTE,
      limit: 5,
      keyGenerator: ip,
    }),
    resetPassword: limiter("reset-password", {
      windowMs: 15 * MINUTE,
      limit: 10,
      failuresOnly: true,
      keyGenerator: ip,
    }),
    changePassword: limiter("change-password", {
      windowMs: 15 * MINUTE,
      limit: 10,
      failuresOnly: true,
      keyGenerator: (req) => req.auth?.userId ?? ip(req),
    }),
  };
}

/** Contact form messages per ip: enough for a shopper, too few for a flood. */
export function contactLimit(enabled = true): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return limiter("contact", {
    windowMs: 60 * MINUTE,
    limit: 5,
    keyGenerator: ip,
  });
}

/**
 * Failed discount codes per signed-in user (else per ip), against guessing
 * codes; a code that applies never counts. Runs after requireAuth.
 */
export function couponLimit(enabled = true): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return limiter("coupon", {
    windowMs: 15 * MINUTE,
    limit: 10,
    failuresOnly: true,
    keyGenerator: (req) => req.auth?.userId ?? ip(req),
  });
}

/**
 * Order lookups without an account that find nothing, per ip, so an
 * order's email can't be guessed; one that finds its order never counts.
 */
export function orderLookupLimit(enabled = true): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return limiter("order-lookup", {
    windowMs: 15 * MINUTE,
    limit: 10,
    failuresOnly: true,
    keyGenerator: ip,
  });
}
