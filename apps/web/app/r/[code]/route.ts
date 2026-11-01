import { NextResponse, type NextRequest } from "next/server";
import {
  REF_COOKIE,
  REF_COOKIE_MAX_AGE,
  referralCodeFrom,
} from "@/lib/referrals";

/**
 * A shared referral link: keeps the code for the bag (REF_COOKIE) and
 * lands on the home page. A code that can't be one just lands.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const res = NextResponse.redirect(new URL("/", req.url));
  const code = referralCodeFrom((await params).code);
  if (code) {
    res.cookies.set(REF_COOKIE, code, {
      maxAge: REF_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
