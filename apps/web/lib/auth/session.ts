import { cookies } from "next/headers";
import type { PublicUser } from "@repo/types";
import { getMe } from "@repo/api-client/server";
import { serverClient } from "@/lib/api/server";
import { userFromAccessToken } from "./claims";
import { ACCESS_COOKIE } from "./cookies";

/**
 * The signed-in user from the access token's claims, without an API call.
 * Good for rendering the header; null once the access token has expired, even
 * if the session can still be refreshed.
 */
export async function getSessionUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  return userFromAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);
}

/**
 * The signed-in user from GET /auth/me, for pages that need fresh data.
 * Returns null when the API rejects the session (401) or the user is gone
 * (404); throws on anything else, so an API outage shows the error page
 * instead of signing the user out.
 */
export async function fetchCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has(ACCESS_COOKIE)) return null;

  const { data, response } = await getMe({
    client: await serverClient(),
    cache: "no-store",
  });
  if (data?.data) return data.data;
  if (response?.status === 401 || response?.status === 404) return null;
  throw new Error(`GET /auth/me failed: ${response?.status ?? "no response"}`);
}

/**
 * Where a protected page sends a user whose session the API rejected. The
 * login page alone would loop: proxy.ts still sees an unexpired access
 * token there and sends the user straight back.
 */
export function sessionExpiredPath(next: string): string {
  return `/session/expired?next=${encodeURIComponent(next)}`;
}
