import { NextResponse, type NextRequest } from "next/server";
import { getMe, logout } from "@repo/api-client/server";
import { serverClient } from "@/lib/api/server";
import { loginPath, safeNextPath } from "@/lib/auth/redirect";

/**
 * Ends a session the API no longer accepts (see sessionExpiredPath), then
 * goes to the login page. It checks /auth/me first, so a link to this route
 * can't sign out someone whose session is fine.
 */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get("next")) ?? "/";
  // Still valid, or the API is unreachable: leave the cookies alone.
  const back = () => NextResponse.redirect(new URL(next, req.url));

  try {
    const client = await serverClient();
    const { response } = await getMe({ client, cache: "no-store" });
    if (response?.status !== 401 && response?.status !== 404) return back();

    const redirect = NextResponse.redirect(new URL(loginPath(next), req.url));
    // The API's logout clears the cookies with the attributes it set them.
    const { response: out } = await logout({ client, cache: "no-store" });
    out?.headers
      .getSetCookie()
      .forEach((cookie) => redirect.headers.append("set-cookie", cookie));
    return redirect;
  } catch {
    return back();
  }
}
