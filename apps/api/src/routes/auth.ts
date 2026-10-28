import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { ErrorCode, ValidationCode } from "@repo/types";
import {
  displayName,
  exchangeGoogleCode,
  GOOGLE_STATE_COOKIE,
  readGoogleState,
  safeNextPath,
  startGoogleSignIn,
  stateCookieOptions,
  type GoogleProfile,
} from "../auth/google";
import { adoptGuest } from "../auth/guest";
import {
  checkPassword,
  dummyHash,
  hashPassword,
  passwordTooLong,
} from "../auth/password";
import {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  UpdateProfileBody,
} from "../auth/schemas";
import {
  clearSessionCookies,
  decide,
  issueSession,
  nextExpiry,
  normalizeEmail,
  publicUser,
  REFRESH_COOKIE,
  setAccessCookie,
  setSessionCookies,
  withinGrace,
} from "../auth/session";
import {
  hashRefreshToken,
  newAccessToken,
  newTokens,
  parseRefresh,
} from "../auth/tokens";
import { googleEnabled, type Config } from "../config";
import {
  consumePasswordReset,
  createGoogleUser,
  createGuestUser,
  createPasswordReset,
  createUser,
  getActiveSessionByID,
  getUserByEmail,
  getUserByGoogleID,
  getUserByID,
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
  rotateSessionToken,
  updateUserName,
  updateUserPassword,
  voidOtherPasswordResets,
  type Session,
  type User,
} from "../db/gen";
import {
  CHECK_VIOLATION,
  pgCode,
  pgConstraint,
  UNIQUE_VIOLATION,
  withTx,
  type Pool,
} from "../db/pool";
import type { Deps } from "../deps";
import { renderPasswordReset } from "../emails/render";
import type { Mailer } from "../emails/mailer";
import { requireAccount, requireAuth } from "../http/middleware";
import { isUuid, userId } from "../http/params";
import { fail, ok, validationFailed } from "../http/response";
import type { Group } from "../http/router";
import { authLimits } from "../http/rate-limit";
import { parseBody } from "../http/validate";
import { log, rlog } from "../log";

/** How long an emailed link works (the email says an hour). */
const RESET_LINK_LIFE = 60 * 60_000;

export function authRoutes(api: Group, deps: Deps) {
  const { db, cfg, mailer } = deps;
  const auth = api.group("/auth");
  // Against password guessing, account spam and email flooding.
  const limits = authLimits(cfg.authRateLimits);
  const signedIn = requireAuth(cfg);

  /**
   * The user of the request's session: its refresh cookie names a live
   * session of that user, and is the session's current token (or was,
   * moments ago). Null without one.
   */
  async function sessionUser(req: Request): Promise<User | null> {
    const token = refreshCookie(req);
    const familyId = refreshFamily(token, cfg);
    if (!familyId) return null;
    const sess = await getActiveSessionByID(db, familyId);
    if (!sess) return null;
    const { user_id } = parseRefresh(token, cfg.jwtRefreshSecret);
    const presented = hashRefreshToken(token);
    if (
      sess.user_id !== user_id ||
      decide(sess, presented, new Date(), cfg.refreshReuseWindow) === "reuse"
    )
      return null;
    return getUserByID(db, sess.user_id);
  }

  /**
   * Hands the request's guest session, if it has one, to the account
   * signing in: see adoptGuest. The new session is issued after.
   */
  async function adoptRequestGuest(req: Request, account: User) {
    const guest = await sessionUser(req);
    if (guest?.role !== "guest") return;
    const adopted = await adoptGuest(db, guest, account);
    rlog.info(req, "guest adopted", {
      guest_id: guest.id,
      user_id: account.id,
      ...adopted,
    });
  }

  // compute now, so the first unknown-email login isn't slower
  dummyHash().catch((err: unknown) =>
    log.error("failed to hash the dummy password", err),
  );

  auth.post("/register", limits.register, async (req, res) => {
    const body = parseBody(RegisterBody, req, res);
    if (!body) return;
    const email = normalizeEmail(body.email);

    if (passwordTooLong(body.password)) {
      // max=72 counts characters; bcrypt's limit is 72 bytes (multibyte chars)
      fieldError(res, "password", "TOO_LONG", "Password is too long");
      return;
    }
    const hash = await hashPassword(body.password);

    let user: User | null;
    try {
      user = await createUser(db, {
        name: body.name,
        email,
        password_hash: hash,
        role: "customer",
        image_url: null,
      });
    } catch (err) {
      switch (pgCode(err)) {
        case UNIQUE_VIOLATION:
          rlog.warn(req, "user already exists");
          fail(res, 409, "USER_ALREADY_EXISTS", "User already exists");
          return;
        case CHECK_VIOLATION: // email = lower(email) fails for some unicode
          rlog.warn(req, "email rejected by db check", {
            constraint: pgConstraint(err),
          });
          validationFailed(
            res,
            [
              {
                code: "INVALID_EMAIL",
                field: "email",
                message: "Enter a valid email address",
              },
            ],
            "Enter a valid email address",
          );
          return;
      }
      throw err;
    }
    if (!user) throw new Error("create user returned no row");

    await adoptRequestGuest(req, user);
    await issueSession(db, req, res, cfg, user);
    rlog.info(req, "user registered", { user_id: user.id });
    ok(res, 201, "Registration successful", publicUser(user));
  });

  // Guest starts a session for a shopper without an account (a hidden
  // 'guest' user), so the bag and checkout work. A request that already
  // has a session, guest or not, gets its user back unchanged.
  auth.post("/guest", limits.guest, async (req, res) => {
    const current = await sessionUser(req);
    if (current) {
      ok(res, 200, "Already signed in", publicUser(current));
      return;
    }
    const user = await createGuestUser(db);
    if (!user) throw new Error("create guest returned no row");

    await issueSession(db, req, res, cfg, user);
    rlog.info(req, "guest session started", { user_id: user.id });
    ok(res, 201, "Guest session started", publicUser(user));
  });

  auth.post("/login", ...limits.login, async (req, res) => {
    const body = parseBody(LoginBody, req, res);
    if (!body) return;
    const email = normalizeEmail(body.email);

    const user = await getUserByEmail(db, email);
    if (!user) {
      await checkPassword(await dummyHash(), body.password);
      rlog.warn(req, "invalid credentials (unknown email)");
      invalidCredentials(res);
      return;
    }
    if (!(await checkPassword(user.password_hash, body.password))) {
      rlog.warn(req, "invalid credentials (wrong password)", {
        user_id: user.id,
      });
      invalidCredentials(res);
      return;
    }

    await adoptRequestGuest(req, user);
    await issueSession(db, req, res, cfg, user);
    rlog.info(req, "user logged in", { user_id: user.id });
    ok(res, 200, "Logged in successfully", publicUser(user));
  });

  // Google sends the browser to Google to pick an account. Every outcome
  // ends on the storefront: the page to return to (?next=) when signed in,
  // else the login page with ?google_error=.
  auth.get("/google", (req, res) => {
    const next = safeNextPath(req.query.next);
    if (!googleEnabled(cfg)) {
      rlog.warn(req, "google sign-in asked for, but it is not set up");
      if (cfg.frontendUrl) {
        res.redirect(302, googleErrorUrl(cfg, "unavailable", next));
        return;
      }
      fail(
        res,
        503,
        "GOOGLE_UNAVAILABLE",
        "Sign in with Google isn't available right now",
      );
      return;
    }
    const { cookie, url } = startGoogleSignIn(cfg, next);
    res.cookie(GOOGLE_STATE_COOKIE, cookie, stateCookieOptions(cfg));
    res.redirect(302, url);
  });

  // GoogleCallback is where Google sends the browser back. The state must
  // match the cookie set above (so another site can't sign someone in to
  // its own account); the code is traded for the Google profile, which
  // finds the user by Google account, then by verified email (linking the
  // two), else creates a customer.
  auth.get("/google/callback", async (req, res) => {
    const st = readGoogleState(cfg, req.cookies?.[GOOGLE_STATE_COOKIE]);
    const { maxAge: _, ...clearOpts } = stateCookieOptions(cfg);
    res.clearCookie(GOOGLE_STATE_COOKIE, clearOpts);
    const next = st?.next ?? null;

    if (!googleEnabled(cfg)) {
      fail(
        res,
        503,
        "GOOGLE_UNAVAILABLE",
        "Sign in with Google isn't available right now",
      );
      return;
    }
    if (typeof req.query.error === "string") {
      // access_denied: the shopper backed out on Google's page.
      rlog.info(req, "google sign-in not completed", {
        error: req.query.error,
      });
      res.redirect(
        302,
        googleErrorUrl(
          cfg,
          req.query.error === "access_denied" ? "cancelled" : "failed",
          next,
        ),
      );
      return;
    }
    const code = req.query.code;
    if (!st || typeof code !== "string" || req.query.state !== st.state) {
      rlog.warn(req, "google callback with a missing or wrong state");
      res.redirect(302, googleErrorUrl(cfg, "failed", next));
      return;
    }

    let profile: GoogleProfile;
    try {
      profile = await exchangeGoogleCode(cfg, code, st);
    } catch (err) {
      rlog.error(req, "google code exchange failed", err);
      res.redirect(302, googleErrorUrl(cfg, "failed", next));
      return;
    }
    if (!profile.emailVerified) {
      rlog.warn(req, "google account email is not verified");
      res.redirect(302, googleErrorUrl(cfg, "unverified", next));
      return;
    }

    const user = await googleUser(profile);
    if (!user) {
      // Emails aren't verified at registration, so linking would hand
      // whoever registered the address first a way into this account.
      rlog.warn(req, "google email already has a password account");
      res.redirect(302, googleErrorUrl(cfg, "exists", next));
      return;
    }

    await adoptRequestGuest(req, user);
    await issueSession(db, req, res, cfg, user);
    rlog.info(req, "user signed in with google", { user_id: user.id });
    res.redirect(
      302,
      `${cfg.frontendUrl}${next ?? (user.role === "admin" ? "/admin" : "/")}`,
    );
  });

  /**
   * The user of a Google account: the one already linked to it, else a new
   * customer. Null when another account already uses the email.
   */
  async function googleUser(profile: GoogleProfile): Promise<User | null> {
    const linked = await getUserByGoogleID(db, profile.sub);
    if (linked) return linked;

    const email = normalizeEmail(profile.email);
    if (await getUserByEmail(db, email)) return null;
    try {
      return await createGoogleUser(db, {
        name: displayName(profile),
        email,
        google_id: profile.sub,
      });
    } catch (err) {
      // Two callbacks for one new account at once: the other one won.
      if (pgCode(err) === UNIQUE_VIOLATION) {
        return getUserByGoogleID(db, profile.sub);
      }
      throw err;
    }
  }

  // Logout always succeeds: cookies are cleared first, then the session is
  // revoked best-effort so a later refresh with a copied token fails.
  auth.post("/logout", async (req, res) => {
    const token = refreshCookie(req);
    clearSessionCookies(res, cfg);

    const familyId = refreshFamily(token, cfg);
    if (familyId) {
      try {
        await revokeSession(db, familyId);
      } catch (err) {
        rlog.error(req, "failed to revoke session on logout", err, {
          family_id: familyId,
        });
      }
    }
    ok(res, 200, "Logged out successfully");
  });

  // Refresh rotates the session's refresh token (compare-and-swap), gives a
  // request that lost a concurrent rotation an access token within the grace
  // window, and revokes the session when an old token is replayed.
  auth.post("/refresh", async (req, res) => {
    const token = refreshCookie(req);
    if (!token) {
      rlog.warn(req, "missing refresh token");
      unauthorized(res, cfg, "Missing refresh token", "MISSING_REFRESH_TOKEN");
      return;
    }

    let claims;
    try {
      claims = parseRefresh(token, cfg.jwtRefreshSecret);
    } catch (err) {
      rlog.warn(req, "invalid refresh token", {
        error: err instanceof Error ? err.message : String(err),
      });
      unauthorized(res, cfg, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
      return;
    }
    if (!isUuid(claims.family_id)) {
      rlog.warn(req, "invalid family id in refresh token", {
        family_id: claims.family_id,
      });
      unauthorized(res, cfg, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
      return;
    }
    const familyId = claims.family_id.toLowerCase();

    // a db outage must not log the user out: a thrown error keeps the cookies
    const sess = await getActiveSessionByID(db, familyId);
    if (!sess) {
      rlog.warn(req, "session not found, expired or revoked", {
        family_id: claims.family_id,
      });
      unauthorized(
        res,
        cfg,
        "Session expired, please log in again",
        "INVALID_REFRESH_TOKEN",
      );
      return;
    }
    if (sess.user_id !== claims.user_id) {
      rlog.warn(req, "refresh token user does not match session", {
        family_id: claims.family_id,
      });
      unauthorized(res, cfg, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
      return;
    }

    const user = await getUserByID(db, sess.user_id);
    if (!user) {
      unauthorized(
        res,
        cfg,
        "Session expired, please log in again",
        "INVALID_REFRESH_TOKEN",
      );
      return;
    }

    const presented = hashRefreshToken(token);
    const now = new Date();

    switch (decide(sess, presented, now, cfg.refreshReuseWindow)) {
      case "rotate":
        await rotate(req, res, sess, user, presented, now);
        return;
      case "grace":
        grace(req, res, user);
        return;
      case "reuse":
        rlog.warn(req, "refresh token reuse detected, revoking session", {
          family_id: claims.family_id,
          user_id: user.id,
        });
        try {
          await revokeSession(db, sess.id);
        } catch (err) {
          rlog.error(req, "failed to revoke session", err, {
            family_id: claims.family_id,
          });
        }
        unauthorized(
          res,
          cfg,
          "Session invalid, please log in again",
          "INVALID_REFRESH_TOKEN",
        );
    }
  });

  async function rotate(
    req: Request,
    res: Response,
    sess: Session,
    user: User,
    presented: string,
    now: Date,
  ) {
    const expiresAt = nextExpiry(
      sess.created_at,
      now,
      cfg.refreshTokenTtl,
      cfg.maxSessionAge,
    );
    const tokens = newTokens(cfg, user, sess.id, expiresAt);

    const rotated = await rotateSessionToken(db, {
      id: sess.id,
      new_token_hash: hashRefreshToken(tokens.refreshToken),
      expected_token_hash: presented,
      expires_at: expiresAt,
    });
    if (!rotated) {
      // Lost the compare-and-swap: a concurrent request rotated this token
      // first. Our token is now the previous one, so serve the grace path.
      const reloaded = await getActiveSessionByID(db, sess.id);
      if (!reloaded) {
        unauthorized(
          res,
          cfg,
          "Session expired, please log in again",
          "INVALID_REFRESH_TOKEN",
        );
        return;
      }
      if (
        withinGrace(reloaded, presented, new Date(), cfg.refreshReuseWindow)
      ) {
        grace(req, res, user);
        return;
      }
      rlog.warn(req, "lost rotation race outside the grace window", {
        user_id: user.id,
      });
      unauthorized(
        res,
        cfg,
        "Session invalid, please log in again",
        "INVALID_REFRESH_TOKEN",
      );
      return;
    }

    setSessionCookies(res, cfg, tokens, expiresAt);
    rlog.info(req, "refresh token rotated", { user_id: user.id });
    ok(res, 200, "Tokens refreshed");
  }

  function grace(req: Request, res: Response, user: User) {
    setAccessCookie(res, cfg, newAccessToken(cfg, user));
    rlog.info(req, "refresh within grace window, issued access token only", {
      user_id: user.id,
    });
    ok(res, 200, "Tokens refreshed");
  }

  // Me returns the authenticated user (fresh from the db, not the token claims).
  auth.get("/me", signedIn, async (req, res) => {
    const user = await getUserByID(db, userId(req));
    if (!user) {
      userNotFound(res);
      return;
    }
    ok(res, 200, "User fetched", publicUser(user));
  });

  // UpdateProfile changes the signed-in user's name. The access token
  // carries the name (pages render it from there), so a fresh one is set
  // with the new name instead of waiting for the next refresh.
  auth.patch("/me", signedIn, requireAccount, async (req, res) => {
    const body = parseBody(UpdateProfileBody, req, res);
    if (!body) return;
    const id = userId(req);

    const user = await updateUserName(db, { id, name: body.name });
    if (!user) {
      userNotFound(res);
      return;
    }
    try {
      setAccessCookie(res, cfg, newAccessToken(cfg, user));
    } catch (err) {
      // The name is saved; the token catches up at the next refresh.
      rlog.error(req, "failed to re-sign access token", err, { user_id: id });
    }

    rlog.info(req, "profile updated", { user_id: id });
    ok(res, 200, "Your details are saved", publicUser(user));
  });

  // ChangePassword sets a new password after checking the current one, and
  // signs out every other session (this one stays), in one transaction. A
  // wrong current password is a field error, not a 401: the client would
  // read a 401 as an expired session and try to refresh.
  auth.post(
    "/me/password",
    signedIn,
    requireAccount,
    limits.changePassword,
    async (req, res) => {
      const body = parseBody(ChangePasswordBody, req, res);
      if (!body) return;
      const id = userId(req);

      const user = await getUserByID(db, id);
      if (!user) {
        userNotFound(res);
        return;
      }
      if (!(await checkPassword(user.password_hash, body.current_password))) {
        rlog.warn(req, "change password: wrong current password", {
          user_id: id,
        });
        fieldError(
          res,
          "current_password",
          "VALIDATION_ERROR",
          "Your current password is incorrect",
        );
        return;
      }
      if (passwordTooLong(body.new_password)) {
        fieldError(res, "new_password", "TOO_LONG", "Password is too long");
        return;
      }
      const hash = await hashPassword(body.new_password);

      // The session of the refresh cookie (its family id), or null, which
      // no session has, when there is none: then every session is signed
      // out, this one at its next refresh.
      const keepId = refreshFamily(refreshCookie(req), cfg);
      await withTx(db, async (tx) => {
        await updateUserPassword(tx, { id, password_hash: hash });
        await revokeOtherUserSessions(tx, { user_id: id, keep_id: keepId });
      });

      rlog.info(req, "password changed", { user_id: id });
      ok(res, 200, "Password changed. Your other devices are signed out.");
    },
  );

  // ForgotPassword emails a link to choose a new password. It answers the
  // same 202 whether or not the email has an account, and does the work
  // after answering, so neither the reply nor its timing tells which emails
  // are registered. An account gets at most one email a minute.
  auth.post("/password/forgot", limits.forgotPassword, (req, res) => {
    const body = parseBody(ForgotPasswordBody, req, res);
    if (!body) return;
    if (!mailer || !cfg.frontendUrl) {
      rlog.warn(
        req,
        "password reset asked for, but mail or FRONTEND_URL is not set up",
      );
      fail(
        res,
        503,
        "MAIL_UNAVAILABLE",
        "Password reset emails aren't available right now. Try again later.",
      );
      return;
    }

    const email = normalizeEmail(body.email);
    const fields = { request_id: req.requestId };
    // Detached from the request, which ends with the reply below.
    sendResetLink(db, mailer, cfg.frontendUrl, email, fields).catch(
      (err: unknown) => log.error("password reset failed", err, fields),
    );

    ok(res, 202, "If an account uses that email, a reset link is on its way");
  });

  // ResetPassword sets a new password from an emailed link. The link works
  // once; the change signs the account out everywhere, all in one
  // transaction, so a stolen session can't outlive it.
  auth.post("/password/reset", limits.resetPassword, async (req, res) => {
    const body = parseBody(ResetPasswordBody, req, res);
    if (!body) return;

    // Before the transaction: bcrypt is slow, and the row lock isn't needed for it.
    if (passwordTooLong(body.password)) {
      fieldError(res, "password", "TOO_LONG", "Password is too long");
      return;
    }
    const passwordHash = await hashPassword(body.password);

    const resetUserId = await withTx(db, async (tx) => {
      const consumed = await consumePasswordReset(
        tx,
        hashResetToken(body.token),
      );
      if (!consumed) return null;
      await updateUserPassword(tx, {
        id: consumed.user_id,
        password_hash: passwordHash,
      });
      await revokeAllUserSessions(tx, consumed.user_id);
      return consumed.user_id;
    });
    if (!resetUserId) {
      rlog.warn(req, "password reset with an unknown, used or expired link");
      fail(
        res,
        400,
        "INVALID_RESET_TOKEN",
        "This reset link has expired or was already used. Ask for a new one.",
      );
      return;
    }

    rlog.info(req, "password reset", { user_id: resetUserId });
    ok(res, 200, "Your password has been changed. Sign in with the new one.");
  });
}

async function sendResetLink(
  db: Pool,
  mailer: Mailer,
  frontendUrl: string,
  email: string,
  fields: Record<string, unknown>,
) {
  const user = await getUserByEmail(db, email);
  if (!user) {
    log.info("password reset for an email without an account", fields);
    return;
  }
  const userFields = { ...fields, user_id: user.id };

  const { token, hash } = newResetToken();
  const created = await createPasswordReset(db, {
    user_id: user.id,
    token_hash: hash,
    expires_at: new Date(Date.now() + RESET_LINK_LIFE),
  });
  if (!created) {
    log.info("password reset throttled: one email a minute", userFields);
    return;
  }
  // Only the newest link works; a failure here leaves older ones valid
  // until they expire, which is no worse than before.
  try {
    await voidOtherPasswordResets(db, { user_id: user.id, id: created.id });
  } catch (err) {
    log.error("password reset: void older links", err, userFields);
  }

  let msg;
  try {
    msg = renderPasswordReset(user.name, token, frontendUrl);
  } catch (err) {
    log.error("password reset: render email", err, fields);
    return;
  }
  try {
    await mailer.send({
      to: email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
  } catch (err) {
    log.error("password reset: send email", err, userFields);
    return;
  }
  log.info("password reset email sent", userFields);
}

/** 32 random bytes for the link, and the hash the table keeps instead. */
export function newResetToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashResetToken(token) };
}

export const hashResetToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** The login page with a Google error the page explains. */
function googleErrorUrl(
  cfg: Config,
  error: "unavailable" | "cancelled" | "failed" | "unverified" | "exists",
  next: string | null,
): string {
  const q = new URLSearchParams({ google_error: error });
  if (next) q.set("next", next);
  return `${cfg.frontendUrl}/auth/login?${q.toString()}`;
}

/** The refresh cookie, or "" when there is none. */
function refreshCookie(req: Request): string {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof token === "string" ? token : "";
}

/** The session id (family) of a valid refresh token, or null. */
function refreshFamily(token: string, cfg: Config): string | null {
  if (!token) return null;
  try {
    const { family_id } = parseRefresh(token, cfg.jwtRefreshSecret);
    return isUuid(family_id) ? family_id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Clears the session cookies and responds 401. */
function unauthorized(
  res: Response,
  cfg: Config,
  message: string,
  code: ErrorCode,
) {
  clearSessionCookies(res, cfg);
  fail(res, 401, code, message);
}

function invalidCredentials(res: Response) {
  fail(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
}

function userNotFound(res: Response) {
  fail(res, 404, "USER_NOT_FOUND", "User not found");
}

/** The 400 of a body that failed on one field. */
function fieldError(
  res: Response,
  field: string,
  code: ValidationCode,
  message: string,
) {
  validationFailed(res, [{ code, field, message }]);
}
