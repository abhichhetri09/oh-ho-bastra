import { randomUUID } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import type { Config } from "../config";
import type { Queryable } from "../db/queryable";
import { createSession, type Session, type User } from "../db/gen";
import {
  hashRefreshToken,
  newAccessToken,
  newTokens,
  type Tokens,
} from "./tokens";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
/** Readable by JS and the web's proxy; carries no secret. */
export const LOGGED_IN_COOKIE = "is_logged_in";

/** What to do with a presented refresh token. */
export type RefreshDecision =
  /** It is the session's current token: issue a new pair. */
  | "rotate"
  /**
   * It was rotated moments ago by a concurrent request (another tab, or the
   * web proxy): issue only a new access token.
   */
  | "grace"
  /** An old or unknown token: treat it as theft and revoke the session. */
  | "reuse";

type SessionTokens = Pick<
  Session,
  "current_token_hash" | "previous_token_hash" | "previous_rotated_at"
>;

/**
 * Whether presentedHash is the session's previous token and it was rotated
 * less than reuseWindow (ms) ago.
 */
export function withinGrace(
  sess: SessionTokens,
  presentedHash: string,
  now: Date,
  reuseWindow: number,
): boolean {
  return (
    sess.previous_token_hash !== null &&
    presentedHash === sess.previous_token_hash &&
    sess.previous_rotated_at !== null &&
    now.getTime() - sess.previous_rotated_at.getTime() < reuseWindow
  );
}

export function decide(
  sess: SessionTokens,
  presentedHash: string,
  now: Date,
  reuseWindow: number,
): RefreshDecision {
  if (presentedHash === sess.current_token_hash) return "rotate";
  if (withinGrace(sess, presentedHash, now, reuseWindow)) return "grace";
  return "reuse";
}

/**
 * Slides the session by the refresh TTL but never past createdAt + maxAge,
 * so an active session still ends eventually.
 */
export function nextExpiry(
  createdAt: Date,
  now: Date,
  ttl: number,
  maxAge: number,
): Date {
  const next = now.getTime() + ttl;
  const limit = createdAt.getTime() + maxAge;
  return new Date(Math.min(next, limit));
}

// --- cookies --------------------------------------------------------------

/** SameSite=Lax, path /; Secure and the cookie domain only in production. */
function cookieOptions(cfg: Config, httpOnly: boolean): CookieOptions {
  return {
    httpOnly,
    secure: cfg.production,
    sameSite: "lax",
    path: "/",
    ...(cfg.production && cfg.cookieDomain ? { domain: cfg.cookieDomain } : {}),
  };
}

/**
 * Sets a cookie with a Max-Age in whole seconds, as gin's c.SetCookie did:
 * a positive age lives that long, 0 is a browser-session cookie and a
 * negative one deletes the cookie (Max-Age=0).
 */
function setCookie(
  res: Response,
  cfg: Config,
  name: string,
  value: string,
  maxAgeSeconds: number,
  httpOnly: boolean,
) {
  const age = Math.trunc(maxAgeSeconds);
  const opts = cookieOptions(cfg, httpOnly);
  if (age > 0) opts.maxAge = age * 1000;
  else if (age < 0) opts.maxAge = 0;
  res.cookie(name, value, opts);
}

export function setAccessCookie(
  res: Response,
  cfg: Config,
  accessToken: string,
) {
  setCookie(
    res,
    cfg,
    ACCESS_COOKIE,
    accessToken,
    cfg.accessTokenTtl / 1000,
    true,
  );
}

/** The access and refresh cookies; the refresh one lives exactly as long as its session. */
export function setSessionCookies(
  res: Response,
  cfg: Config,
  tokens: Tokens,
  refreshExpiresAt: Date,
) {
  const refreshMaxAge = (refreshExpiresAt.getTime() - Date.now()) / 1000;
  setAccessCookie(res, cfg, tokens.accessToken);
  setCookie(res, cfg, REFRESH_COOKIE, tokens.refreshToken, refreshMaxAge, true);
  setCookie(res, cfg, LOGGED_IN_COOKIE, "true", refreshMaxAge, false);
}

export function clearSessionCookies(res: Response, cfg: Config) {
  setCookie(res, cfg, ACCESS_COOKIE, "", -1, true);
  setCookie(res, cfg, REFRESH_COOKIE, "", -1, true);
  setCookie(res, cfg, LOGGED_IN_COOKIE, "", -1, false);
}

// --- sessions -------------------------------------------------------------

/** Bounds what a client can make us store per session. */
const MAX_USER_AGENT_BYTES = 512;

/** s cut to at most n UTF-8 bytes without splitting a character. */
export function truncateBytes(s: string, n: number): string {
  const bytes = Buffer.from(s);
  if (bytes.length <= n) return s;
  let end = n;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString();
}

/**
 * The client's address as gin's ClientIP gave it: an IPv4 client of a
 * dual-stack listener as 127.0.0.1, not ::ffff:127.0.0.1.
 */
export const clientIp = (req: Request) =>
  (req.ip ?? "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");

/** Creates the session row for a fresh login and sets the cookies. */
export async function issueSession(
  db: Queryable,
  req: Request,
  res: Response,
  cfg: Config,
  user: User,
) {
  const familyId = randomUUID();
  const now = new Date();
  const expiresAt = nextExpiry(
    now,
    now,
    cfg.refreshTokenTtl,
    cfg.maxSessionAge,
  );
  const tokens = newTokens(cfg, user, familyId, expiresAt);
  const userAgent = truncateBytes(
    req.get("user-agent") ?? "",
    MAX_USER_AGENT_BYTES,
  );
  await createSession(db, {
    id: familyId,
    user_id: user.id,
    current_token_hash: hashRefreshToken(tokens.refreshToken),
    user_agent: userAgent || null,
    ip_address: clientIp(req) || null,
    expires_at: expiresAt,
  });
  setSessionCookies(res, cfg, tokens, expiresAt);
}

export { newAccessToken };

/** Trims and lowercases, so one address is one account (users.email = lower(email)). */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The user as auth endpoints return it. */
export function publicUser(
  user: Pick<User, "id" | "name" | "email" | "role" | "image_url">,
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    image_url: user.image_url,
  };
}
