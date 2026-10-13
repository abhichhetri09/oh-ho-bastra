// Cookie names set by the API (apps/api/internal/auth/session.go).
export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
// Readable by JS; only says a session probably exists, carries no secret.
export const LOGGED_IN_COOKIE = "is_logged_in";

/** Whether the browser holds the is_logged_in hint cookie. Client only. */
export function hasLoggedInCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((c) => c === `${LOGGED_IN_COOKIE}=true`);
}
