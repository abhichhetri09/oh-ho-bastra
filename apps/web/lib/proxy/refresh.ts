import type { NextRequest } from "next/server";
import type { PublicUser } from "@repo/types";
import { createServerClient, refreshSession } from "@repo/api-client/server";
import { userFromAccessToken } from "@/lib/auth/claims";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";

export type RefreshResult =
  // fresh: the new token cookies, to pass on to the page being rendered.
  | { kind: "ok"; user: PublicUser; setCookies: string[]; fresh: Cookie[] }
  // The session is gone; setCookies clears the auth cookies.
  | { kind: "unauthorized"; setCookies: string[] }
  // Network error or 5xx: the session may still be valid, keep the cookies.
  | { kind: "error" };

type Cookie = { name: string; value: string };

function parseSetCookie(header: string): Cookie | null {
  const pair = header.split(";", 1)[0] ?? "";
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
}

/** Refreshes the session server-side with the request's refresh cookie. */
export async function refresh(req: NextRequest): Promise<RefreshResult> {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return { kind: "unauthorized", setCookies: [] };

  let response: Response | undefined;
  try {
    ({ response } = await refreshSession({
      client: createServerClient({
        headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    }));
  } catch {
    return { kind: "error" };
  }

  // The fetch client returns no response when the request itself failed.
  if (!response) return { kind: "error" };

  const setCookies = response.headers.getSetCookie();
  if (response.status === 401) return { kind: "unauthorized", setCookies };
  if (!response.ok) return { kind: "error" };

  // A rotation sets both tokens; a grace-window refresh sets only the access
  // token, and the current refresh cookie stays valid.
  const fresh = setCookies
    .map(parseSetCookie)
    .filter(
      (c): c is Cookie =>
        c !== null &&
        c.value !== "" &&
        (c.name === ACCESS_COOKIE || c.name === REFRESH_COOKIE),
    );
  const user = userFromAccessToken(
    fresh.find((c) => c.name === ACCESS_COOKIE)?.value,
  );
  if (!user) return { kind: "error" };

  return { kind: "ok", user, setCookies, fresh };
}
