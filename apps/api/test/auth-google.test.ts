import jwt from "jsonwebtoken";
import type { Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../src/db/gen";
import { makeUser, setupTestApp, testConfig } from "./helpers";

// Sign in with Google, with Google's token endpoint stubbed: what it sends
// back is an ID token for whichever profile the test picks.

const cfg = {
  ...testConfig(),
  googleClientId: "client-123.apps.googleusercontent.com",
  googleClientSecret: "google-secret",
  googleRedirectUri: "http://localhost:5000/api/v1/auth/google/callback",
};
const { http, db } = setupTestApp({ cfg });
const off = setupTestApp({
  cfg: {
    ...cfg,
    googleClientId: "",
    googleClientSecret: "",
    googleRedirectUri: "",
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const cookies = (res: Response): string[] => {
  const raw = res.headers["set-cookie"] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : [];
};

const cookieNamed = (res: Response, name: string) =>
  cookies(res).find((c) => c.startsWith(`${name}=`));

/** Starts a sign-in: the state Google would echo and the cookie it needs. */
async function start(next?: string) {
  const res = await http()
    .get("/api/v1/auth/google")
    .query(next ? { next } : {});
  expect(res.status).toBe(302);
  const url = new URL(res.headers.location as string);
  const cookie = cookieNamed(res, "google_oauth")!.split(";")[0]!;
  return { res, url, cookie, state: url.searchParams.get("state")! };
}

interface Profile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  aud?: string;
  nonce?: string;
}

/** Google's token endpoint answers with an ID token for profile. */
function stubGoogle(profile: Profile, nonceFrom: URL) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBeTruthy();
    const idToken = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: profile.aud ?? cfg.googleClientId,
        sub: profile.sub ?? "google-sub-1",
        email: profile.email ?? "ada@gmail.com",
        email_verified: profile.email_verified ?? true,
        name: profile.name ?? "Ada Lovelace",
        nonce: profile.nonce ?? nonceFrom.searchParams.get("nonce"),
      },
      "google-signs-this-not-us",
      { expiresIn: 3600 },
    );
    return new Response(JSON.stringify({ id_token: idToken }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function callback(
  started: Awaited<ReturnType<typeof start>>,
  query: Record<string, string> = {},
) {
  return http()
    .get("/api/v1/auth/google/callback")
    .set("Cookie", started.cookie)
    .query({ code: "the-code", state: started.state, ...query });
}

async function usersWithEmail(email: string) {
  const { rows } = await db.query<User>(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );
  return rows;
}

describe("GET /auth/google", () => {
  it("redirects to Google with PKCE and a state cookie", async () => {
    const { url, res } = await start("/checkout");
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(cfg.googleClientId);
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.googleRedirectUri);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    const cookie = cookieNamed(res, "google_oauth")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/google/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("sends the shopper back to login when Google isn't set up", async () => {
    const res = await off.http().get("/api/v1/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "http://localhost:3000/auth/login?google_error=unavailable",
    );
  });
});

describe("GET /auth/google/callback", () => {
  it("creates a customer, signs them in and returns to next", async () => {
    const started = await start("/checkout?step=2");
    stubGoogle({ email: "Ada@Gmail.com" }, started.url);

    const res = await callback(started);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/checkout?step=2");
    expect(cookieNamed(res, "access_token")).toBeTruthy();
    expect(cookieNamed(res, "refresh_token")).toBeTruthy();
    expect(cookieNamed(res, "is_logged_in")).toBeTruthy();

    const [user, ...more] = await usersWithEmail("ada@gmail.com");
    expect(more).toEqual([]);
    expect(user).toMatchObject({
      name: "Ada Lovelace",
      role: "customer",
      google_id: "google-sub-1",
      password_hash: "",
    });
  });

  it("signs the same Google account into the same user", async () => {
    for (let i = 0; i < 2; i++) {
      const started = await start();
      stubGoogle({}, started.url);
      const res = await callback(started);
      expect(res.headers.location).toBe("http://localhost:3000/");
    }
    expect(await usersWithEmail("ada@gmail.com")).toHaveLength(1);
  });

  it("sends an admin to /admin", async () => {
    const started = await start();
    stubGoogle({}, started.url);
    await callback(started);
    await db.query("UPDATE users SET role = 'admin' WHERE google_id = $1", [
      "google-sub-1",
    ]);

    const again = await start();
    stubGoogle({}, again.url);
    const res = await callback(again);
    expect(res.headers.location).toBe("http://localhost:3000/admin");
  });

  it("won't take over a password account with the same email", async () => {
    await makeUser(db, { email: "ada@gmail.com" });
    const started = await start("/account");
    stubGoogle({}, started.url);

    const res = await callback(started);
    expect(res.headers.location).toBe(
      "http://localhost:3000/auth/login?google_error=exists&next=%2Faccount",
    );
    expect(cookieNamed(res, "access_token")).toBeUndefined();
    const [user] = await usersWithEmail("ada@gmail.com");
    expect(user!.google_id).toBeNull();
  });

  it("refuses an unverified Google email", async () => {
    const started = await start();
    stubGoogle({ email_verified: false }, started.url);
    const res = await callback(started);
    expect(res.headers.location).toContain("google_error=unverified");
    expect(await usersWithEmail("ada@gmail.com")).toEqual([]);
  });

  it.each([
    ["another app's token", { aud: "someone-else" }],
    ["another sign-in's nonce", { nonce: "replayed" }],
  ])("refuses %s", async (_, profile) => {
    const started = await start();
    stubGoogle(profile, started.url);
    const res = await callback(started);
    expect(res.headers.location).toContain("google_error=failed");
    expect(cookieNamed(res, "access_token")).toBeUndefined();
  });

  it("refuses a state that doesn't match the cookie", async () => {
    const started = await start();
    const fetch = stubGoogle({}, started.url);
    const res = await callback(started, { state: "forged" });
    expect(res.headers.location).toContain("google_error=failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a callback without the state cookie", async () => {
    const res = await http()
      .get("/api/v1/auth/google/callback")
      .query({ code: "the-code", state: "anything" });
    expect(res.headers.location).toBe(
      "http://localhost:3000/auth/login?google_error=failed",
    );
  });

  it("explains a cancelled sign-in", async () => {
    const started = await start();
    const res = await callback(started, { error: "access_denied" });
    expect(res.headers.location).toContain("google_error=cancelled");
  });

  it("ignores a next that leaves the storefront", async () => {
    const started = await start("//evil.example/steal");
    stubGoogle({}, started.url);
    const res = await callback(started);
    expect(res.headers.location).toBe("http://localhost:3000/");
  });
});
