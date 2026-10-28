import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import request from "supertest";
import {
  cookieFor,
  makeUser,
  setupTestApp,
  testConfig,
  TEST_PASSWORD,
} from "./helpers";

// The auth limits, on (the other suites run with them off). Each app gets
// fresh counters, so every test builds its own.

const { db, deps } = setupTestApp();

function app(trustedProxies: string[] | number = []) {
  const cfg = { ...testConfig(), authRateLimits: true, trustedProxies };
  return buildApp({ ...deps, cfg }).app;
}

const login = (
  a: ReturnType<typeof app>,
  email: string,
  password: string,
  ip?: string,
) => {
  const r = request(a).post("/api/v1/auth/login");
  if (ip) r.set("X-Forwarded-For", ip);
  return r.send({ email, password });
};

describe("login limits", () => {
  it("locks an account out after 10 failed attempts from one address", async () => {
    const a = app();
    const user = await makeUser(db);
    for (let i = 0; i < 10; i++) {
      expect((await login(a, user.email, "wrong-password")).status).toBe(401);
    }
    const blocked = await login(a, user.email, TEST_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please wait 15 minutes and try again.",
    });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(800);
    // the same address can still sign in to another account
    const other = await makeUser(db);
    expect((await login(a, other.email, TEST_PASSWORD)).status).toBe(200);
  });

  it("counts an email however it's written", async () => {
    const a = app();
    const user = await makeUser(db);
    for (let i = 0; i < 10; i++) {
      await login(
        a,
        i % 2 ? user.email.toUpperCase() : ` ${user.email} `,
        "wrong-password",
      );
    }
    expect((await login(a, user.email, TEST_PASSWORD)).status).toBe(429);
  });

  it("never counts successful logins", async () => {
    const a = app();
    const user = await makeUser(db);
    for (let i = 0; i < 15; i++) {
      expect((await login(a, user.email, TEST_PASSWORD)).status).toBe(200);
    }
  });

  it("stops one address guessing across many accounts after 50 failures", async () => {
    const a = app();
    for (let i = 0; i < 50; i++) {
      expect(
        (await login(a, `nobody${i}@example.com`, "wrong-password")).status,
      ).toBe(401);
    }
    expect(
      (await login(a, "someone-else@example.com", "wrong-password")).status,
    ).toBe(429);
  });

  it("behind a trusted proxy, counts each visitor's own address", async () => {
    const a = app(1);
    const user = await makeUser(db);
    for (let i = 0; i < 10; i++)
      await login(a, user.email, "wrong-password", "203.0.113.7");
    expect(
      (await login(a, user.email, TEST_PASSWORD, "203.0.113.7")).status,
    ).toBe(429);
    expect(
      (await login(a, user.email, TEST_PASSWORD, "198.51.100.4")).status,
    ).toBe(200);
  });

  it("without a trusted proxy, ignores a forged X-Forwarded-For", async () => {
    const a = app();
    const user = await makeUser(db);
    for (let i = 0; i < 10; i++)
      await login(a, user.email, "wrong-password", `203.0.113.${i}`);
    expect(
      (await login(a, user.email, TEST_PASSWORD, "198.51.100.4")).status,
    ).toBe(429);
  });
});

describe("other auth limits", () => {
  it("allows 10 sign-ups an hour per address", async () => {
    const a = app();
    for (let i = 0; i < 10; i++) {
      const res = await request(a)
        .post("/api/v1/auth/register")
        .send({
          name: "Ada Lovelace",
          email: `new${i}@example.com`,
          password: "longenough1",
        });
      expect(res.status).toBe(201);
    }
    const res = await request(a).post("/api/v1/auth/register").send({
      name: "Ada Lovelace",
      email: "new10@example.com",
      password: "longenough1",
    });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("allows 5 password reset requests per 15 minutes per address", async () => {
    const a = app();
    for (let i = 0; i < 5; i++) {
      // 503 here (no mailer in tests), but every request counts
      const res = await request(a)
        .post("/api/v1/auth/password/forgot")
        .send({ email: "a@example.com" });
      expect(res.status).not.toBe(429);
    }
    const res = await request(a)
      .post("/api/v1/auth/password/forgot")
      .send({ email: "a@example.com" });
    expect(res.status).toBe(429);
  });

  it("stops guessing the current password after 10 wrong ones", async () => {
    const a = app();
    const user = await makeUser(db);
    const cookie = cookieFor(deps.cfg, user);
    for (let i = 0; i < 10; i++) {
      const res = await request(a)
        .post("/api/v1/auth/me/password")
        .set("Cookie", cookie)
        .send({
          current_password: "wrong-password",
          new_password: "a-new-password",
        });
      expect(res.status).toBe(400);
    }
    const res = await request(a)
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookie)
      .send({
        current_password: TEST_PASSWORD,
        new_password: "a-new-password",
      });
    expect(res.status).toBe(429);
  });
});

describe("guest and order lookup limits", () => {
  it("allows 20 new guest sessions an hour per address", async () => {
    const a = app();
    for (let i = 0; i < 20; i++) {
      expect((await request(a).post("/api/v1/auth/guest")).status).toBe(201);
    }
    const res = await request(a).post("/api/v1/auth/guest");
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
  });

  it("allows 10 lookups that find nothing per 15 minutes per address", async () => {
    const a = app();
    const lookup = () =>
      request(a)
        .post("/api/v1/orders/lookup")
        .send({ number: 1001, email: "ada@example.com" });
    for (let i = 0; i < 10; i++) {
      expect((await lookup()).status).toBe(404);
    }
    const res = await lookup();
    expect(res.status).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(800);
  });
});
