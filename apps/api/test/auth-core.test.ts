import jwt from "jsonwebtoken";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  checkPassword,
  hashPassword,
  passwordTooLong,
} from "../src/auth/password";
import {
  clearSessionCookies,
  decide,
  nextExpiry,
  normalizeEmail,
  setSessionCookies,
  truncateBytes,
  type RefreshDecision,
} from "../src/auth/session";
import {
  hashRefreshToken,
  newAccessToken,
  newTokens,
  parseAccess,
  parseRefresh,
  signRefresh,
} from "../src/auth/tokens";
import type { Config } from "../src/config";
import type { User } from "../src/db/gen";

// Ports of internal/auth/session_test.go and tokens_test.go.

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const TEST_FAMILY_ID = "22222222-2222-2222-2222-222222222222";

const testConfig = (): Config =>
  ({
    jwtAccessSecret: "a".repeat(32),
    jwtRefreshSecret: "r".repeat(32),
    accessTokenTtl: 15 * 60 * SECOND,
    refreshTokenTtl: 30 * DAY,
    refreshReuseWindow: 30 * SECOND,
    maxSessionAge: 90 * DAY,
  }) as Config;

const testUser = (): User => ({
  id: TEST_USER_ID,
  name: "Ada Lovelace",
  email: "ada@example.com",
  password_hash: "",
  role: "customer",
  image_url: null,
  created_at: new Date(),
  updated_at: new Date(),
  google_id: null,
});

describe("decide", () => {
  const now = new Date();
  const window = 30 * SECOND;
  const sess = (rotatedAgo: number) => ({
    current_token_hash: "current",
    previous_token_hash: "previous",
    previous_rotated_at: new Date(now.getTime() - rotatedAgo),
  });
  const cases: [string, ReturnType<typeof sess>, string, RefreshDecision][] = [
    ["current token rotates", sess(SECOND), "current", "rotate"],
    [
      "previous token inside window is grace",
      sess(5 * SECOND),
      "previous",
      "grace",
    ],
    [
      "previous token at window edge is reuse",
      sess(window),
      "previous",
      "reuse",
    ],
    [
      "previous token after window is reuse",
      sess(60 * SECOND),
      "previous",
      "reuse",
    ],
    ["unknown token is reuse", sess(SECOND), "something-else", "reuse"],
  ];
  it.each(cases)("%s", (_name, s, presented, want) => {
    expect(decide(s, presented, now, window)).toBe(want);
  });
  it("never rotated, unknown token is reuse", () => {
    const s = {
      current_token_hash: "current",
      previous_token_hash: null,
      previous_rotated_at: null,
    };
    expect(decide(s, "previous", now, window)).toBe("reuse");
  });
});

describe("nextExpiry", () => {
  const ttl = 30 * DAY;
  const maxAge = 90 * DAY;
  const created = new Date(Date.UTC(2026, 0, 1));
  const at = (days: number) => new Date(created.getTime() + days * DAY);
  it.each([
    ["fresh session slides by ttl", at(0), at(30)],
    ["mid-life slides by ttl", at(30), at(60)],
    ["near the cap is clamped", at(80), at(90)],
  ])("%s", (_name, now, want) => {
    expect(nextExpiry(created, now, ttl, maxAge).getTime()).toBe(
      want.getTime(),
    );
  });
});

it("normalizeEmail trims and lowercases", () => {
  expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe(
    "ada.lovelace@example.com",
  );
});

it("truncateBytes never splits a character", () => {
  expect(truncateBytes("short", 10)).toBe("short");
  // "é" is 2 bytes; cutting at 2 would split it, so it backs off to 1 byte
  expect(truncateBytes("aé", 2)).toBe("a");
  expect(truncateBytes("abcdef", 3)).toBe("abc");
});

describe("tokens", () => {
  it("round-trips an access token", () => {
    const cfg = testConfig();
    const claims = parseAccess(
      newAccessToken(cfg, testUser()),
      cfg.jwtAccessSecret,
    );
    expect(claims).toMatchObject({
      user_id: TEST_USER_ID,
      role: "customer",
      email: "ada@example.com",
      typ: "access",
    });
  });

  it("carries Go's access claims: image_url only when set", () => {
    const cfg = testConfig();
    const plain = jwt.decode(newAccessToken(cfg, testUser())) as Record<
      string,
      unknown
    >;
    expect(Object.keys(plain)).toEqual([
      "user_id",
      "role",
      "email",
      "name",
      "typ",
      "exp",
      "iat",
      "jti",
    ]);
    expect(plain.exp).toBe((plain.iat as number) + 15 * 60);
    const withImage = jwt.decode(
      newAccessToken(cfg, { ...testUser(), image_url: "https://x/y.png" }),
    ) as Record<string, unknown>;
    expect(withImage.image_url).toBe("https://x/y.png");
  });

  it("round-trips a refresh token with the given expiry", () => {
    const cfg = testConfig();
    const exp = new Date(
      Math.floor((Date.now() + 3600 * SECOND) / SECOND) * SECOND,
    );
    const claims = parseRefresh(
      signRefresh(cfg, TEST_USER_ID, TEST_FAMILY_ID, exp),
      cfg.jwtRefreshSecret,
    );
    expect(claims.family_id).toBe(TEST_FAMILY_ID);
    expect(claims.user_id).toBe(TEST_USER_ID);
    expect(claims.exp * SECOND).toBe(exp.getTime());
  });

  // Two pairs signed in the same instant must differ (the old same-second bug).
  it("signs unique pairs back to back", () => {
    const cfg = testConfig();
    const exp = new Date(Date.now() + 3600 * SECOND);
    const a = newTokens(cfg, testUser(), TEST_FAMILY_ID, exp);
    const b = newTokens(cfg, testUser(), TEST_FAMILY_ID, exp);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(a.accessToken).not.toBe(b.accessToken);
  });

  describe("parse rejects", () => {
    const cfg = testConfig();
    const hour = () => new Date(Date.now() + 3600 * SECOND);
    const access = newAccessToken(cfg, testUser());
    const refresh = signRefresh(cfg, TEST_USER_ID, TEST_FAMILY_ID, hour());
    // same key for both, to prove the typ claim (not just the key) separates them
    const shared = "s".repeat(32);
    const sharedCfg = {
      ...testConfig(),
      jwtAccessSecret: shared,
      jwtRefreshSecret: shared,
    };
    const sharedAccess = newAccessToken(sharedCfg, testUser());
    const sharedRefresh = signRefresh(
      sharedCfg,
      TEST_USER_ID,
      TEST_FAMILY_ID,
      hour(),
    );
    const expired = signRefresh(
      cfg,
      TEST_USER_ID,
      TEST_FAMILY_ID,
      new Date(Date.now() - 60 * SECOND),
    );
    const base = { user_id: TEST_USER_ID, role: "customer", typ: "access" };
    const hs384 = jwt.sign(
      { ...base, exp: Math.floor(Date.now() / SECOND) + 60 },
      cfg.jwtAccessSecret,
      {
        algorithm: "HS384",
      },
    );
    const noExp = jwt.sign(base, cfg.jwtAccessSecret, {
      algorithm: "HS256",
      noTimestamp: true,
    });
    const numericRole = jwt.sign({ ...base, role: 1 }, cfg.jwtAccessSecret, {
      algorithm: "HS256",
      expiresIn: 60,
    });

    it.each([
      [
        "access with wrong secret",
        () => parseAccess(access, "x" + cfg.jwtAccessSecret),
      ],
      [
        "refresh with access secret",
        () => parseRefresh(refresh, cfg.jwtAccessSecret),
      ],
      [
        "refresh token as access (shared key)",
        () => parseAccess(sharedRefresh, shared),
      ],
      [
        "access token as refresh (shared key)",
        () => parseRefresh(sharedAccess, shared),
      ],
      ["expired refresh", () => parseRefresh(expired, cfg.jwtRefreshSecret)],
      ["hs384 access", () => parseAccess(hs384, cfg.jwtAccessSecret)],
      ["access without exp", () => parseAccess(noExp, cfg.jwtAccessSecret)],
      [
        "a string claim of another type",
        () => parseAccess(numericRole, cfg.jwtAccessSecret),
      ],
      ["garbage", () => parseAccess("not.a.jwt", cfg.jwtAccessSecret)],
    ])("%s", (_name, parse) => {
      expect(parse).toThrow();
    });
  });

  it("hashes refresh tokens as a deterministic sha256 hex digest", () => {
    const [a1, a2, b] = [
      hashRefreshToken("a"),
      hashRefreshToken("a"),
      hashRefreshToken("b"),
    ];
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toHaveLength(64);
  });
});

describe("passwords", () => {
  it("hashes in Go's $2a$ form at cost 10", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).toMatch(/^\$2a\$10\$/);
    expect(await checkPassword(hash, "secret123")).toBe(true);
    expect(await checkPassword(hash, "secret124")).toBe(false);
  });

  it("verifies a hash written by Go's bcrypt", async () => {
    // golang.org/x/crypto/bcrypt.GenerateFromPassword("secret123", bcrypt.DefaultCost)
    const goHash =
      "$2a$10$7h/24XvrSKfVB/F4MN4dpOlsM2bvdF677rPT8ikSG6HtBm9IxtLEy";
    expect(await checkPassword(goHash, "secret123")).toBe(true);
    expect(await checkPassword(goHash, "secret124")).toBe(false);
  });

  it("treats a malformed hash as a mismatch", async () => {
    expect(await checkPassword("not-a-hash", "secret123")).toBe(false);
  });

  it("counts the 72-byte limit in bytes", () => {
    expect(passwordTooLong("a".repeat(72))).toBe(false);
    expect(passwordTooLong("é".repeat(37))).toBe(true); // 37 characters, 74 bytes
  });
});

describe("session cookies", () => {
  const fakeRes = () => {
    const cookie = vi.fn();
    return { res: { cookie } as unknown as Response, cookie };
  };
  const tokens = { accessToken: "a.b.c", refreshToken: "d.e.f" };

  it("are Secure on the cookie domain in production", () => {
    const { res, cookie } = fakeRes();
    const cfg = {
      ...testConfig(),
      production: true,
      cookieDomain: ".example.com",
    };
    setSessionCookies(res, cfg, tokens, new Date(Date.now() + 3600 * SECOND));
    expect(cookie.mock.calls.map((c) => c[0])).toEqual([
      "access_token",
      "refresh_token",
      "is_logged_in",
    ]);
    for (const [name, , opts] of cookie.mock.calls) {
      expect(opts).toMatchObject({
        secure: true,
        domain: ".example.com",
        sameSite: "lax",
        path: "/",
      });
      expect(opts.httpOnly).toBe(name !== "is_logged_in");
    }
    expect(cookie.mock.calls[0]![2].maxAge).toBe(15 * 60 * SECOND);
    expect(cookie.mock.calls[1]![2].maxAge).toBeLessThanOrEqual(3600 * SECOND);
  });

  it("leave out the domain outside production", () => {
    const { res, cookie } = fakeRes();
    setSessionCookies(
      res,
      { ...testConfig(), production: false, cookieDomain: ".example.com" },
      tokens,
      new Date(Date.now() + 3600 * SECOND),
    );
    expect(cookie.mock.calls[0]![2]).not.toHaveProperty("domain");
    expect(cookie.mock.calls[0]![2].secure).toBe(false);
  });

  it("are deleted with Max-Age=0", () => {
    const { res, cookie } = fakeRes();
    clearSessionCookies(res, { ...testConfig(), production: false });
    for (const [, value, opts] of cookie.mock.calls) {
      expect(value).toBe("");
      expect(opts.maxAge).toBe(0);
    }
  });

  it("live for the browser session when the session ends within a second, as gin's Max-Age 0", () => {
    const { res, cookie } = fakeRes();
    setSessionCookies(res, testConfig(), tokens, new Date(Date.now() + 500));
    expect(cookie.mock.calls[1]![2]).not.toHaveProperty("maxAge");
  });
});
