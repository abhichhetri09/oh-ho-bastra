import { NextResponse, type NextRequest } from "next/server";
import { isSignedOutOnlyPath, requiredRoles } from "@/lib/proxy/config";
import { handleProtected, handleSignedOutOnly } from "@/lib/proxy/handlers";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isSignedOutOnlyPath(pathname)) return handleSignedOutOnly(req);

  const roles = requiredRoles(pathname);
  if (roles) return handleProtected(req, roles);

  return NextResponse.next();
}

// Only guarded paths run the proxy; storefront pages skip it entirely.
export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/auth/:path*",
  ],
};
