import jwt from "jsonwebtoken";
import type { Response } from "supertest";
import { describe, expect, it } from "vitest";
import { hashRefreshToken, signRefresh } from "../src/auth/tokens";
import { getActiveSessionByID, type Session } from "../src/db/gen";
import { cookieFor, makeUser, setupTestApp, TEST_PASSWORD } from "./helpers";

// Ports of internal/handlers/auth/*_test.go, against the real database.

const { http, db, cfg } = setupTestApp();

const register = (body: Record<string, unknown> = {}) =>
  http()
    .post("/api/v1/auth/register")
    .send({
      name: "Ada Lovelace",
      email: "  Ada@Example.COM ",
      password: " spaced pw ",
      ...body,
    });

const login = (email: string, password = TEST_PASSWORD) =>
  http().post("/api/v1/auth/login").send({ email, password });

const refresh = (cookie?: string) => {
  const req = http().post("/api/v1/auth/refresh");
  return cookie ? req.set("Cookie", cookie) : req;
};

/** The sessions of a user, oldest first. */
async function sessionsOf(userId: string): Promise<Session[]> {
  const { rows } = await db.query<Session>(
    "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at",
    [userId],
  );
  return rows;
}

/** A signed-in user: their row, login response and its session cookies. */
async function loggedIn(fields: Parameters<typeof makeUser>[1] = {}) {
  const user = await makeUser(db, fields);
  const res = await login(user.email);
  expect(res.status).toBe(200);
  return {
    user,
    res,
    cookie: cookieHeader(res),
    refreshToken: cookiesOf(res).refresh_token!.value,
  };
}

const familyOf = (refreshToken: string) =>
  (jwt.decode(refreshToken) as { family_id: string }).family_id;

// --- Set-Cookie headers ---------------------------------------------------

interface SetCookie {
  value: string;
  /** Max-Age in seconds; undefined for a browser-session cookie. */
  maxAge?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  path?: string;
  domain?: string;
}

function cookiesOf(res: Response): Record<string, SetCookie> {
  const raw = res.headers["set-cookie"] as unknown;
  const lines = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string"
      ? [raw]
      : [];
  const out: Record<string, SetCookie> = {};
  for (const line of lines) {
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const eq = pair!.indexOf("=");
    const cookie: SetCookie = {
      value: decodeURIComponent(pair!.slice(eq + 1)),
      httpOnly: false,
      secure: false,
    };
    for (const attr of attrs) {
      const [k, v] = attr.split("=");
      switch (k!.toLowerCase()) {
        case "max-age":
          cookie.maxAge = Number(v);
          break;
        case "httponly":
          cookie.httpOnly = true;
          break;
        case "secure":
          cookie.secure = true;
          break;
        case "samesite":
          cookie.sameSite = v;
          break;
        case "path":
          cookie.path = v;
          break;
        case "domain":
          cookie.domain = v;
          break;
      }
    }
    out[pair!.slice(0, eq)] = cookie;
  }
  return out;
}

const SESSION_COOKIES = ["access_token", "refresh_token", "is_logged_in"];

/** All three session cookies set, with a positive max-age. */
function sessionSet(res: Response): boolean {
  const c = cookiesOf(res);
  return SESSION_COOKIES.every(
    (n) => c[n] && c[n].value !== "" && (c[n].maxAge ?? 0) > 0,
  );
}

/** All three session cookies expired. */
function sessionCleared(res: Response): boolean {
  const c = cookiesOf(res);
  return SESSION_COOKIES.every(
    (n) => c[n] && c[n].value === "" && c[n].maxAge === 0,
  );
}

/** A Cookie header carrying the given cookies of a response (e.g. after login). */
function cookieHeader(res: Response, names = SESSION_COOKIES): string {
  const c = cookiesOf(res);
  return names
    .filter((n) => c[n])
    .map((n) => `${n}=${c[n]!.value}`)
    .join("; ");
}

describe("POST /auth/register", () => {
  it("creates a customer with a lowercased email and a session", async () => {
    const res = await register().set("User-Agent", "vitest");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: "Registration successful",
      data: {
        id: expect.any(String),
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "customer",
        image_url: null,
      },
    });
    expect(sessionSet(res)).toBe(true);

    const [sess] = await sessionsOf(res.body.data.id);
    expect(sess!.user_agent).toBe("vitest");
    expect(sess!.ip_address).not.toMatch(/^::ffff:/);
    expect(sess!.current_token_hash).toBe(
      hashRefreshToken(cookiesOf(res).refresh_token!.value),
    );

    // stored as Go's $2a$ hash, and the password isn't trimmed
    const { rows } = await db.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [res.body.data.id],
    );
    expect(rows[0].password_hash).toMatch(/^\$2a\$10\$/);
    expect((await login("ada@example.com", " spaced pw ")).status).toBe(200);
    expect((await login("ada@example.com", "spaced pw")).status).toBe(401);
  });

  it("sets the cookies as gin did", async () => {
    const c = cookiesOf(await register());
    for (const name of ["access_token", "refresh_token", "is_logged_in"]) {
      expect(c[name]).toMatchObject({
        path: "/",
        sameSite: "Lax",
        secure: false,
      });
      expect(c[name]!.domain).toBeUndefined();
    }
    expect(c.access_token).toMatchObject({ httpOnly: true, maxAge: 15 * 60 });
    expect(c.refresh_token!.httpOnly).toBe(true);
    expect(c.is_logged_in).toMatchObject({ httpOnly: false, value: "true" });
    const thirtyDays = 30 * 24 * 3600;
    expect(c.refresh_token!.maxAge).toBeGreaterThan(thirtyDays - 5);
    expect(c.refresh_token!.maxAge).toBeLessThanOrEqual(thirtyDays);
    expect(c.is_logged_in!.maxAge).toBe(c.refresh_token!.maxAge);
  });

  it("a duplicate email is 409", async () => {
    await register();
    const res = await register({ email: "ada@example.com" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "User already exists",
      code: "USER_ALREADY_EXISTS",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("72 multibyte characters exceed bcrypt's 72 bytes: 400, not 500", async () => {
    const res = await register({ password: "é".repeat(72) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "TOO_LONG",
          field: "password",
          message: "Password is too long",
        },
      ],
    });
  });

  it("reports every invalid field with the validator's messages", async () => {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        { code: "REQUIRED_FIELD", field: "name", message: "Name is required" },
        {
          code: "INVALID_EMAIL",
          field: "email",
          message: "Enter a valid email address",
        },
        {
          code: "REQUIRED_FIELD",
          field: "password",
          message: "Password is required",
        },
      ],
    });
  });

  it.each([
    [
      { name: "  " },
      { code: "REQUIRED_FIELD", field: "name", message: "Name is required" },
    ],
    [
      { name: " A " },
      {
        code: "TOO_SHORT",
        field: "name",
        message: "Name must be at least 2 characters",
      },
    ],
    [
      { name: "x".repeat(51) },
      {
        code: "TOO_LONG",
        field: "name",
        message: "Name cannot exceed 50 characters",
      },
    ],
    [
      { name: "R2D2" },
      {
        code: "INVALID_FORMAT",
        field: "name",
        message:
          "Name can only contain letters, spaces, apostrophes and hyphens",
      },
    ],
    [
      { email: "   " },
      { code: "REQUIRED_FIELD", field: "email", message: "Email is required" },
    ],
    [
      { email: `${"a".repeat(250)}@example.com` },
      {
        code: "TOO_LONG",
        field: "email",
        message: "Email cannot exceed 254 characters",
      },
    ],
    // passwords aren't trimmed: three spaces are too short, not missing
    [
      { password: "   " },
      {
        code: "TOO_SHORT",
        field: "password",
        message: "Password must be at least 8 characters",
      },
    ],
    // four emoji are eight UTF-16 units but four characters
    [
      { password: "😀😀😀😀" },
      {
        code: "TOO_SHORT",
        field: "password",
        message: "Password must be at least 8 characters",
      },
    ],
    [
      { password: "p".repeat(73) },
      {
        code: "TOO_LONG",
        field: "password",
        message: "Password cannot exceed 72 characters",
      },
    ],
    [
      { name: 42 },
      { code: "INVALID_TYPE", field: "name", message: "Name must be a string" },
    ],
  ])("rejects %j", async (body, error) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([error]);
  });

  it("accepts names and emails Go's validator accepts", async () => {
    const res = await register({
      name: "José O'Brien-Smith",
      email: "  josé@exämple.com ",
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "José O'Brien-Smith",
      email: "josé@exämple.com",
    });
  });
});

describe("POST /auth/login", () => {
  it("signs in with a normalized email and sets the session cookies", async () => {
    const user = await makeUser(db, {
      email: "ada@example.com",
      image_url: "https://img.example/ada.png",
    });
    const res = await login("  ADA@example.com ");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Logged in successfully",
      data: {
        id: user.id,
        name: user.name,
        email: "ada@example.com",
        role: "customer",
        image_url: "https://img.example/ada.png",
      },
    });
    expect(sessionSet(res)).toBe(true);
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it("a wrong password and an unknown email are indistinguishable", async () => {
    await makeUser(db, { email: "ada@example.com" });
    const wrong = await login("ada@example.com", "wrong-password");
    const unknown = await login("nobody@example.com", "wrong-password");
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        message: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("an empty password is required; a blank one is checked", async () => {
    const empty = await login("ada@example.com", "");
    expect(empty.status).toBe(400);
    expect(empty.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "password",
        message: "Password is required",
      },
    ]);
    expect((await login("ada@example.com", "   ")).status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the session and clears the cookies", async () => {
    const { user, cookie } = await loggedIn();
    const res = await http().post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Logged out successfully",
    });
    expect(sessionCleared(res)).toBe(true);
    const [sess] = await sessionsOf(user.id);
    expect(sess!.revoked_at).not.toBeNull();
  });

  it.each([
    ["no cookie", undefined],
    ["an invalid token", "refresh_token=garbage"],
  ])("with %s still succeeds", async (_name, cookie) => {
    const { user } = await loggedIn();
    const req = http().post("/api/v1/auth/logout");
    const res = await (cookie ? req.set("Cookie", cookie) : req);
    expect(res.status).toBe(200);
    expect(sessionCleared(res)).toBe(true);
    expect((await sessionsOf(user.id))[0]!.revoked_at).toBeNull();
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the current token with compare-and-swap", async () => {
    const { user, cookie, refreshToken } = await loggedIn();
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Tokens refreshed" });
    expect(sessionSet(res)).toBe(true);

    const [sess] = await sessionsOf(user.id);
    const next = cookiesOf(res).refresh_token!.value;
    expect(sess!.current_token_hash).toBe(hashRefreshToken(next));
    expect(sess!.previous_token_hash).toBe(hashRefreshToken(refreshToken));
    expect(familyOf(next)).toBe(familyOf(refreshToken));
  });

  it("never extends a session past the max session age", async () => {
    const { user, cookie } = await loggedIn();
    await db.query(
      "UPDATE sessions SET created_at = now() - interval '89 days' WHERE user_id = $1",
      [user.id],
    );
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    const [sess] = await sessionsOf(user.id);
    expect(sess!.expires_at.getTime()).toBe(
      sess!.created_at.getTime() + cfg.maxSessionAge,
    );
    expect(cookiesOf(res).refresh_token!.maxAge).toBeLessThanOrEqual(25 * 3600);
  });

  it("gives the previous token an access token only inside the grace window", async () => {
    const { user, cookie } = await loggedIn();
    expect((await refresh(cookie)).status).toBe(200);
    const before = (await sessionsOf(user.id))[0]!;

    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Tokens refreshed" });
    const c = cookiesOf(res);
    expect(Object.keys(c)).toEqual(["access_token"]);
    expect(c.access_token!.maxAge).toBe(15 * 60);
    const after = (await sessionsOf(user.id))[0]!;
    expect(after.current_token_hash).toBe(before.current_token_hash);
    expect(after.revoked_at).toBeNull();
  });

  it("revokes the session when the previous token comes back after the grace window", async () => {
    const { user, cookie } = await loggedIn();
    const rotated = await refresh(cookie);
    await db.query(
      "UPDATE sessions SET previous_rotated_at = now() - interval '1 minute' WHERE user_id = $1",
      [user.id],
    );
    const res = await refresh(cookie);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Session invalid, please log in again",
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(sessionCleared(res)).toBe(true);
    expect((await sessionsOf(user.id))[0]!.revoked_at).not.toBeNull();
    // the thief's revocation also ends the real user's session
    expect((await refresh(cookieHeader(rotated))).status).toBe(401);
  });

  it("an unknown token of the session is reuse", async () => {
    const { user, refreshToken } = await loggedIn();
    const forged = signRefresh(
      cfg,
      user.id,
      familyOf(refreshToken),
      new Date(Date.now() + 3600_000),
    );
    const res = await refresh(`refresh_token=${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Session invalid, please log in again");
    expect(await getActiveSessionByID(db, familyOf(refreshToken))).toBeNull();
  });

  it("concurrent refreshes with one token both succeed; one rotates", async () => {
    const { user, cookie } = await loggedIn();
    const results = await Promise.all([
      refresh(cookie),
      refresh(cookie),
      refresh(cookie),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const rotated = results.filter((r) => cookiesOf(r).refresh_token);
    expect(rotated).toHaveLength(1);
    const [sess] = await sessionsOf(user.id);
    expect(sess!.revoked_at).toBeNull();
    expect(sess!.current_token_hash).toBe(
      hashRefreshToken(cookiesOf(rotated[0]!).refresh_token!.value),
    );
  });

  it("an expired or revoked session is 401 and clears the cookies", async () => {
    const { user, cookie } = await loggedIn();
    await db.query(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1",
      [user.id],
    );
    const res = await refresh(cookie);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Session expired, please log in again",
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(sessionCleared(res)).toBe(true);
  });

  it("a token whose user does not own the session is 401", async () => {
    const { refreshToken } = await loggedIn();
    const other = await makeUser(db);
    const token = signRefresh(
      cfg,
      other.id,
      familyOf(refreshToken),
      new Date(Date.now() + 3600_000),
    );
    const res = await refresh(`refresh_token=${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid refresh token",
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(sessionCleared(res)).toBe(true);
  });

  it("a missing cookie is 401 and clears the cookies", async () => {
    const res = await refresh();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Missing refresh token",
      code: "MISSING_REFRESH_TOKEN",
    });
    expect(sessionCleared(res)).toBe(true);
  });

  it("an access token in the refresh cookie is 401", async () => {
    const user = await makeUser(db);
    const res = await refresh(
      `refresh_token=${cookieFor(cfg, user).split("=")[1]}`,
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid refresh token",
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});

describe("GET /auth/me", () => {
  it("returns the user from the database, without the password hash", async () => {
    const user = await makeUser(db, { name: "Ada" });
    await db.query("UPDATE users SET name = 'Ada L.' WHERE id = $1", [user.id]);
    const res = await http()
      .get("/api/v1/auth/me")
      .set("Cookie", cookieFor(cfg, user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "User fetched",
      data: {
        id: user.id,
        name: "Ada L.",
        email: user.email,
        role: "customer",
        image_url: null,
      },
    });
  });

  it("a deleted user is 404", async () => {
    const user = await makeUser(db);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    const res = await http()
      .get("/api/v1/auth/me")
      .set("Cookie", cookieFor(cfg, user));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  });

  it("needs a signed-in user", async () => {
    const res = await http().get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_ACCESS_TOKEN");
  });
});

describe("PATCH /auth/me", () => {
  it("saves the name and re-signs the access token with it", async () => {
    const user = await makeUser(db);
    const res = await http()
      .patch("/api/v1/auth/me")
      .set("Cookie", cookieFor(cfg, user))
      .send({ name: "  Grace  " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Your details are saved",
      data: {
        id: user.id,
        name: "Grace",
        email: user.email,
        role: "customer",
        image_url: null,
      },
    });
    const c = cookiesOf(res);
    expect(Object.keys(c)).toEqual(["access_token"]);
    expect((jwt.decode(c.access_token!.value) as { name: string }).name).toBe(
      "Grace",
    );
  });

  it("validates the name", async () => {
    const user = await makeUser(db);
    const res = await http()
      .patch("/api/v1/auth/me")
      .set("Cookie", cookieFor(cfg, user))
      .send({ name: "G" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "TOO_SHORT",
        field: "name",
        message: "Name must be at least 2 characters",
      },
    ]);
  });

  it("a deleted user is 404", async () => {
    const user = await makeUser(db);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    const res = await http()
      .patch("/api/v1/auth/me")
      .set("Cookie", cookieFor(cfg, user))
      .send({ name: "Grace" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });
});

describe("POST /auth/me/password", () => {
  const change = (cookie: string, body: Record<string, unknown>) =>
    http().post("/api/v1/auth/me/password").set("Cookie", cookie).send(body);

  it("changes the password and signs out the other sessions only", async () => {
    const { user, cookie, refreshToken } = await loggedIn();
    const other = await login(user.email);
    const res = await change(cookie, {
      current_password: TEST_PASSWORD,
      new_password: "brand-new-pw",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Password changed. Your other devices are signed out.",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();

    expect(
      await getActiveSessionByID(db, familyOf(refreshToken)),
    ).not.toBeNull();
    expect(
      await getActiveSessionByID(
        db,
        familyOf(cookiesOf(other).refresh_token!.value),
      ),
    ).toBeNull();
    expect((await login(user.email)).status).toBe(401);
    expect((await login(user.email, "brand-new-pw")).status).toBe(200);
  });

  it("without a refresh cookie signs out every session", async () => {
    const { user } = await loggedIn();
    const res = await change(cookieFor(cfg, user), {
      current_password: TEST_PASSWORD,
      new_password: "brand-new-pw",
    });
    expect(res.status).toBe(200);
    expect(
      (await sessionsOf(user.id)).every((s) => s.revoked_at !== null),
    ).toBe(true);
  });

  it("a wrong current password is a field error, not a 401", async () => {
    const { cookie } = await loggedIn();
    const res = await change(cookie, {
      current_password: "not-it",
      new_password: "brand-new-pw",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "VALIDATION_ERROR",
          field: "current_password",
          message: "Your current password is incorrect",
        },
      ],
    });
  });

  it("validates both fields with the validator's messages", async () => {
    const { cookie } = await loggedIn();
    const res = await change(cookie, {
      current_password: "",
      new_password: "short",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "current_password",
        message: "Current password is required",
      },
      {
        code: "TOO_SHORT",
        field: "new_password",
        message: "New password must be at least 8 characters",
      },
    ]);
  });

  it("a new password over 72 bytes is 400", async () => {
    const { cookie } = await loggedIn();
    const res = await change(cookie, {
      current_password: TEST_PASSWORD,
      new_password: "é".repeat(40),
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "TOO_LONG",
        field: "new_password",
        message: "Password is too long",
      },
    ]);
  });
});

describe("POST /auth/password/forgot without mail", () => {
  it("is 503 MAIL_UNAVAILABLE", async () => {
    const res = await http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: "ada@example.org" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      message:
        "Password reset emails aren't available right now. Try again later.",
      code: "MAIL_UNAVAILABLE",
    });
  });

  it("validates the body first", async () => {
    const res = await http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });
});
