import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { isSignedOutOnlyPath } from "@/lib/proxy/config";
import { accessClaims, nowSec, token } from "./jwt";

// Fake POST /auth/refresh: answers with `refreshReply`.
type Reply = { status: number; setCookies: string[] } | "network-error";
let refreshReply: Reply;
let refreshCookieSent: string | undefined;

mock.module("@repo/api-client/server", () => ({
  createServerClient: (config: { headers: { cookie: string } }) => config,
  refreshSession: async ({
    client,
  }: {
    client: { headers: { cookie: string } };
  }) => {
    refreshCookieSent = client.headers.cookie;
    if (refreshReply === "network-error") throw new TypeError("fetch failed");
    const headers = new Headers();
    refreshReply.setCookies.forEach((c) => headers.append("set-cookie", c));
    return {
      response: new Response(null, { status: refreshReply.status, headers }),
    };
  },
}));

const { handleProtected, handleSignedOutOnly } =
  await import("@/lib/proxy/handlers");

const customer = token(accessClaims());
const admin = token(accessClaims({ role: "admin" }));
const expired = token(accessClaims({ exp: nowSec() - 5 }));

function req(path: string, cookie = "") {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

const location = (res: Response) => res.headers.get("location");
// What the page renders with: the request cookie header passed on by
// NextResponse.next({ request: { headers } }).
const forwardedCookie = (res: Response) =>
  res.headers.get("x-middleware-request-cookie");

beforeEach(() => {
  refreshReply = { status: 200, setCookies: [] };
  refreshCookieSent = undefined;
});

test("protected: no refresh cookie goes to login with next", async () => {
  const res = await handleProtected(req("/account?tab=1"), ["customer"]);
  expect(location(res)).toBe(
    "http://localhost:3000/auth/login?next=%2Faccount%3Ftab%3D1",
  );
});

test("protected: valid access token with the right role passes", async () => {
  const res = await handleProtected(
    req("/account", `access_token=${customer}; refresh_token=r`),
    ["admin", "customer"],
  );
  expect(location(res)).toBeNull();
  expect(refreshCookieSent).toBeUndefined();
});

test("protected: wrong role goes home", async () => {
  const res = await handleProtected(
    req("/admin", `access_token=${customer}; refresh_token=r`),
    ["admin"],
  );
  expect(location(res)).toBe("http://localhost:3000/");
});

test("protected: expired access refreshes and keeps other cookies", async () => {
  refreshReply = {
    status: 200,
    setCookies: [
      `access_token=${admin}; Path=/; HttpOnly; SameSite=Lax`,
      "refresh_token=new-r; Path=/; HttpOnly; SameSite=Lax",
      "is_logged_in=true; Path=/; SameSite=Lax",
    ],
  };
  const res = await handleProtected(
    req("/admin", `theme=dark; access_token=${expired}; refresh_token=old-r`),
    ["admin"],
  );

  expect(refreshCookieSent).toBe("refresh_token=old-r");
  expect(location(res)).toBeNull();
  expect(res.headers.getSetCookie()).toHaveLength(3);
  const cookie = forwardedCookie(res) ?? "";
  expect(cookie).toContain("theme=dark");
  expect(cookie).toContain(`access_token=${admin}`);
  expect(cookie).toContain("refresh_token=new-r");
  expect(cookie).not.toContain("old-r");
});

test("protected: grace refresh (access only) keeps the refresh cookie", async () => {
  refreshReply = {
    status: 200,
    setCookies: [`access_token=${customer}; Path=/; HttpOnly`],
  };
  const res = await handleProtected(
    req("/account", "refresh_token=still-valid"),
    ["customer"],
  );
  const cookie = forwardedCookie(res) ?? "";
  expect(cookie).toContain("refresh_token=still-valid");
  expect(cookie).toContain(`access_token=${customer}`);
});

test("protected: refreshed user with the wrong role goes home with cookies", async () => {
  refreshReply = {
    status: 200,
    setCookies: [`access_token=${customer}; Path=/; HttpOnly`],
  };
  const res = await handleProtected(req("/admin", "refresh_token=r"), [
    "admin",
  ]);
  expect(location(res)).toBe("http://localhost:3000/");
  expect(res.headers.getSetCookie()).toHaveLength(1);
});

test("protected: 401 refresh forwards the API's cookie clearing", async () => {
  refreshReply = {
    status: 401,
    setCookies: ["access_token=; Max-Age=0", "refresh_token=; Max-Age=0"],
  };
  const res = await handleProtected(req("/account", "refresh_token=r"), [
    "customer",
  ]);
  expect(location(res)).toBe(
    "http://localhost:3000/auth/login?next=%2Faccount",
  );
  expect(res.headers.getSetCookie()).toEqual([
    "access_token=; Max-Age=0",
    "refresh_token=; Max-Age=0",
  ]);
});

test.each([
  ["5xx", { status: 503, setCookies: [] }],
  ["network error", "network-error"],
  ["200 without an access cookie", { status: 200, setCookies: [] }],
] as const)(
  "protected: %s keeps cookies and goes to login",
  async (_, reply) => {
    refreshReply = reply as Reply;
    const res = await handleProtected(req("/account", "refresh_token=r"), [
      "customer",
    ]);
    expect(location(res)).toBe(
      "http://localhost:3000/auth/login?next=%2Faccount",
    );
    expect(res.headers.getSetCookie()).toEqual([]);
  },
);

test("signed-out only: anonymous visitors see the page", async () => {
  const res = await handleSignedOutOnly(req("/auth/login"));
  expect(location(res)).toBeNull();
});

test("signed-out only: signed-in users go to a safe next or home", async () => {
  const cookie = `access_token=${admin}; refresh_token=r`;
  expect(location(await handleSignedOutOnly(req("/auth/login", cookie)))).toBe(
    "http://localhost:3000/admin",
  );
  expect(
    location(
      await handleSignedOutOnly(req("/auth/login?next=%2Fcart", cookie)),
    ),
  ).toBe("http://localhost:3000/cart");
  expect(
    location(
      await handleSignedOutOnly(req("/auth/login?next=%2F%2Fevil.com", cookie)),
    ),
  ).toBe("http://localhost:3000/admin");
});

test("signed-out only: expired access refreshes, then redirects", async () => {
  refreshReply = {
    status: 200,
    setCookies: [`access_token=${customer}; Path=/; HttpOnly`],
  };
  const res = await handleSignedOutOnly(req("/auth/login", "refresh_token=r"));
  expect(location(res)).toBe("http://localhost:3000/");
  expect(res.headers.getSetCookie()).toHaveLength(1);
});

test("signed-out only: dead session shows the page and clears cookies", async () => {
  refreshReply = { status: 401, setCookies: ["refresh_token=; Max-Age=0"] };
  const res = await handleSignedOutOnly(req("/auth/login", "refresh_token=r"));
  expect(location(res)).toBeNull();
  expect(res.headers.getSetCookie()).toEqual(["refresh_token=; Max-Age=0"]);
});

test("a password reset link opens signed in or out", () => {
  expect(isSignedOutOnlyPath("/auth/reset")).toBe(false);
  expect(isSignedOutOnlyPath("/auth/forgot")).toBe(true);
  expect(isSignedOutOnlyPath("/auth/login")).toBe(true);
});
