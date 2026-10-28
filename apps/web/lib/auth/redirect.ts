import type { UserRole } from "@repo/types";

export const LOGIN_PATH = "/auth/login";

/**
 * Returns next if it is a path on this site, else null. Rejects absolute and
 * protocol-relative URLs ("//evil.com", "/\evil.com") so ?next= can't be used
 * as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  try {
    const base = "http://ohhobastra.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export const REGISTER_PATH = "/auth/register";

function withNext(page: string, path?: string): string {
  const next = safeNextPath(path);
  return next && next !== "/"
    ? `${page}?next=${encodeURIComponent(next)}`
    : page;
}

/** The login page, returning to path after signing in. */
export function loginPath(path?: string): string {
  return withNext(LOGIN_PATH, path);
}

/**
 * The sign-up page, returning to path after creating the account, with
 * the email filled in when given (a guest's order email).
 */
export function registerPath(path?: string, email?: string): string {
  const page = withNext(REGISTER_PATH, path);
  if (!email) return page;
  return `${page}${page.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}`;
}

/**
 * The user when they have an account, else null: a guest (the hidden
 * account a shopper gets on their first add to the bag) is signed out
 * everywhere but the bag and checkout.
 */
export function accountOf<T extends { role: UserRole }>(
  user: T | null | undefined,
): T | null {
  return user && user.role !== "guest" ? user : null;
}

/** Where a user lands when there is no ?next=. */
export function homeFor(role: UserRole): string {
  return role === "admin" ? "/admin" : "/";
}
