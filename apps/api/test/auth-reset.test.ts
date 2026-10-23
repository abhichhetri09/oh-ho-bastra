import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveSessionByID } from "../src/db/gen";
import type { Mailer, Message } from "../src/emails/mailer";
import { hashResetToken, newResetToken } from "../src/routes/auth";
import { makeUser, setupTestApp, testConfig, TEST_PASSWORD } from "./helpers";

// Ports of internal/handlers/auth/password_reset_test.go, plus the
// flows the Go tests left to manual testing.

// The real templates belong to the emails port; the link is all that matters here.
const render = vi.hoisted(() =>
  vi.fn((name: string, token: string, frontendUrl: string) => ({
    subject: "Reset your password",
    html: `<p>Hi ${name}</p><a href="${frontendUrl}/reset-password?token=${token}">Reset</a>`,
    text: `${frontendUrl}/reset-password?token=${token}`,
  })),
);
vi.mock("../src/emails/render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/emails/render")>()),
  renderPasswordReset: render,
}));

const sent: Message[] = [];
const mailer: Mailer = {
  send: async (msg) => {
    sent.push(msg);
  },
};

const { http, db } = setupTestApp({ mailer });
const noFrontend = setupTestApp({
  mailer,
  cfg: { ...testConfig(), frontendUrl: "" },
});

beforeEach(() => {
  sent.length = 0;
  render.mockClear();
});

const forgot = (email: string) =>
  http().post("/api/v1/auth/password/forgot").send({ email });
const reset = (token: string, password = "brand-new-pw") =>
  http().post("/api/v1/auth/password/reset").send({ token, password });

/** The token of the link in the last email sent. */
const sentToken = () => new URL(sent.at(-1)!.text).searchParams.get("token")!;

/** Lets the work done after the 202 finish. */
const settle = () => new Promise((r) => setTimeout(r, 150));

describe("POST /auth/password/forgot", () => {
  it("answers 202 and emails a link to the account", async () => {
    const user = await makeUser(db, { name: "Ada", email: "ada@example.com" });
    const res = await forgot("  ADA@example.com ");
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      success: true,
      message: "If an account uses that email, a reset link is on its way",
    });

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      to: "ada@example.com",
      subject: "Reset your password",
    });
    const token = sentToken();
    expect(render).toHaveBeenCalledWith("Ada", token, "http://localhost:3000");

    // the table keeps the hash, valid for an hour
    const { rows } = await db.query(
      "SELECT token_hash, extract(epoch FROM expires_at - created_at) AS life FROM password_reset_tokens WHERE user_id = $1",
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashResetToken(token));
    expect(Math.round(Number(rows[0].life))).toBe(3600);
  });

  it("answers the same for an email without an account, and sends nothing", async () => {
    const res = await forgot("nobody@example.com");
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      success: true,
      message: "If an account uses that email, a reset link is on its way",
    });
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("sends at most one email a minute per account", async () => {
    await makeUser(db, { email: "ada@example.com" });
    await forgot("ada@example.com");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect((await forgot("ada@example.com")).status).toBe(202);
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("voids older links: only the newest works", async () => {
    const user = await makeUser(db, { email: "ada@example.com" });
    await forgot("ada@example.com");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const first = sentToken();
    await db.query(
      "UPDATE password_reset_tokens SET created_at = now() - interval '2 minutes' WHERE user_id = $1",
      [user.id],
    );
    await forgot("ada@example.com");
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect((await reset(first)).status).toBe(400);
    expect((await reset(sentToken())).status).toBe(200);
  });

  it("validates the email", async () => {
    const res = await forgot("not-an-email");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "INVALID_EMAIL",
          field: "email",
          message: "Enter a valid email address",
        },
      ],
    });
  });

  it("is 503 without FRONTEND_URL", async () => {
    const res = await noFrontend
      .http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: "ada@example.org" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("MAIL_UNAVAILABLE");
  });
});

describe("POST /auth/password/reset", () => {
  async function linkFor(email = "ada@example.com") {
    const user = await makeUser(db, { email });
    await forgot(email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    return { user, token: sentToken() };
  }

  it("sets the password once and signs the account out everywhere", async () => {
    const { user, token } = await linkFor();
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    const family = (
      await db.query("SELECT id FROM sessions WHERE user_id = $1", [user.id])
    ).rows[0].id as string;

    const res = await reset(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Your password has been changed. Sign in with the new one.",
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(login.status).toBe(200);
    expect(await getActiveSessionByID(db, family)).toBeNull();

    const signIn = (password: string) =>
      http().post("/api/v1/auth/login").send({ email: user.email, password });
    expect((await signIn(TEST_PASSWORD)).status).toBe(401);
    expect((await signIn("brand-new-pw")).status).toBe(200);

    const again = await reset(token, "another-pw-1");
    expect(again.status).toBe(400);
    expect(again.body).toEqual({
      success: false,
      message:
        "This reset link has expired or was already used. Ask for a new one.",
      code: "INVALID_RESET_TOKEN",
    });
  });

  it("refuses an expired link", async () => {
    const { user, token } = await linkFor();
    await db.query(
      "UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [user.id],
    );
    const res = await reset(token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RESET_TOKEN");
  });

  it("refuses an unknown link without changing anything", async () => {
    const res = await reset("not-a-real-token");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RESET_TOKEN");
  });

  it("validates with the validator's messages; the token isn't trimmed", async () => {
    const res = await http()
      .post("/api/v1/auth/password/reset")
      .send({ token: "", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "token",
        message: "Reset link is required",
      },
      {
        code: "TOO_SHORT",
        field: "password",
        message: "Password must be at least 8 characters",
      },
    ]);
    const long = await reset("t".repeat(101));
    expect(long.body.errors).toEqual([
      {
        code: "TOO_LONG",
        field: "token",
        message: "Reset link cannot exceed 100 characters",
      },
    ]);
    const { token } = await linkFor();
    expect((await reset(` ${token} `)).status).toBe(400);
  });

  it("a password over 72 bytes is 400", async () => {
    const res = await reset("whatever", "é".repeat(40));
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { code: "TOO_LONG", field: "password", message: "Password is too long" },
    ]);
  });
});

it("reset tokens are 43 random URL-safe characters, stored as their sha256", () => {
  const a = newResetToken();
  const b = newResetToken();
  expect(a.token).not.toBe(b.token);
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a.hash).toBe(hashResetToken(a.token));
  expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
});
