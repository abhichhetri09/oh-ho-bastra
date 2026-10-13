import { NextResponse, type NextRequest } from "next/server";
import type { PublicUser, UserRole } from "@repo/types";
import { userFromAccessToken } from "@/lib/auth/claims";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { homeFor, loginPath, safeNextPath } from "@/lib/auth/redirect";
import { refresh, type RefreshResult } from "./refresh";

function redirect(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url));
}

function withSetCookies(res: NextResponse, setCookies: string[]): NextResponse {
  setCookies.forEach((cookie) => res.headers.append("set-cookie", cookie));
  return res;
}

function toLogin(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  return redirect(req, loginPath(pathname + search));
}

/**
 * Continues to the page with the refreshed tokens in the request's cookie
 * header, so server components see the new session in this same request.
 * Every other cookie is kept.
 */
function continueWithFreshCookies(
  req: NextRequest,
  result: Extract<RefreshResult, { kind: "ok" }>,
): NextResponse {
  const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
  result.fresh.forEach((c) => jar.set(c.name, c.value));

  const headers = new Headers(req.headers);
  headers.set(
    "cookie",
    [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
  );
  return withSetCookies(
    NextResponse.next({ request: { headers } }),
    result.setCookies,
  );
}

function signedInRedirect(req: NextRequest, user: PublicUser): NextResponse {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  return redirect(req, next ?? homeFor(user.role));
}

/** /auth/*: signed-in users are sent on; everyone else sees the page. */
export async function handleSignedOutOnly(
  req: NextRequest,
): Promise<NextResponse> {
  if (!req.cookies.has(REFRESH_COOKIE)) return NextResponse.next();

  const user = userFromAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  if (user) return signedInRedirect(req, user);

  const result = await refresh(req);
  switch (result.kind) {
    case "ok":
      return withSetCookies(
        signedInRedirect(req, result.user),
        result.setCookies,
      );
    case "unauthorized":
      return withSetCookies(NextResponse.next(), result.setCookies);
    case "error":
      return NextResponse.next();
  }
}

/** Pages that need a session with one of roles. */
export async function handleProtected(
  req: NextRequest,
  roles: readonly UserRole[],
): Promise<NextResponse> {
  if (!req.cookies.has(REFRESH_COOKIE)) return toLogin(req);

  const user = userFromAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  if (user) {
    return roles.includes(user.role) ? NextResponse.next() : redirect(req, "/");
  }

  const result = await refresh(req);
  switch (result.kind) {
    case "ok":
      return roles.includes(result.user.role)
        ? continueWithFreshCookies(req, result)
        : withSetCookies(redirect(req, "/"), result.setCookies);
    case "unauthorized":
      return withSetCookies(toLogin(req), result.setCookies);
    case "error":
      // Can't tell whether the session is valid: keep the cookies and let
      // the user try again from the login page.
      return toLogin(req);
  }
}
