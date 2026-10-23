import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import type { Config } from "../config";

// Sign in with Google: the OpenID Connect authorization code flow with PKCE,
// run by the API. /auth/google sends the browser to Google with a random
// state and nonce, kept in a short-lived signed cookie; Google sends it back
// to /auth/google/callback with a code, which the API trades for an ID token
// over TLS straight from Google's token endpoint. That direct exchange is
// what lets the token's claims be trusted without checking its signature
// (OpenID Connect Core 3.1.3.7).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const GOOGLE_STATE_COOKIE = "google_oauth";
/** The cookie only goes to /auth/google and its callback. */
const STATE_COOKIE_PATH = "/api/v1/auth/google";
/** Time to pick an account on Google's page. */
const STATE_LIFE = 10 * 60_000;
const TOKEN_STATE = "google_state";

/** What the state cookie remembers between the redirect and the callback. */
export interface GoogleState {
  state: string;
  nonce: string;
  verifier: string;
  /** Where to land after signing in (a path on the storefront). */
  next: string | null;
}

/** The ID token claims the API uses. */
export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const random = () => randomBytes(32).toString("base64url");

export function stateCookieOptions(cfg: Config): CookieOptions {
  return {
    httpOnly: true,
    secure: cfg.production,
    // Lax: Google's redirect back is a top-level GET, which Lax allows.
    sameSite: "lax",
    path: STATE_COOKIE_PATH,
    maxAge: STATE_LIFE,
  };
}

/**
 * A new state, its signed cookie value (signed with the refresh secret,
 * under its own "typ" so it can't pass as a session token) and the Google
 * URL to send the browser to.
 */
export function startGoogleSignIn(cfg: Config, next: string | null) {
  const st: GoogleState = {
    state: random(),
    nonce: random(),
    verifier: random(),
    next,
  };
  const cookie = jwt.sign({ ...st, typ: TOKEN_STATE }, cfg.jwtRefreshSecret, {
    algorithm: "HS256",
    expiresIn: STATE_LIFE / 1000,
  });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.googleClientId,
    redirect_uri: cfg.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: st.state,
    nonce: st.nonce,
    code_challenge: createHash("sha256")
      .update(st.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { cookie, url: url.toString() };
}

/** The state from the cookie, or null when it's missing, forged or expired. */
export function readGoogleState(cfg: Config, cookie: unknown) {
  if (typeof cookie !== "string" || !cookie) return null;
  try {
    const p = jwt.verify(cookie, cfg.jwtRefreshSecret, {
      algorithms: ["HS256"],
    }) as Record<string, unknown>;
    if (
      p.typ !== TOKEN_STATE ||
      typeof p.state !== "string" ||
      typeof p.nonce !== "string" ||
      typeof p.verifier !== "string"
    ) {
      return null;
    }
    return {
      state: p.state,
      nonce: p.nonce,
      verifier: p.verifier,
      next: typeof p.next === "string" ? p.next : null,
    } satisfies GoogleState;
  } catch {
    return null;
  }
}

/**
 * Trades the callback's code for the user's Google profile, checking the ID
 * token was issued by Google, for this app, recently, for this sign-in.
 */
export async function exchangeGoogleCode(
  cfg: Config,
  code: string,
  st: GoogleState,
): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.googleClientId,
      client_secret: cfg.googleClientSecret,
      redirect_uri: cfg.googleRedirectUri,
      grant_type: "authorization_code",
      code_verifier: st.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.id_token !== "string") {
    throw new Error(
      `google token exchange failed: ${res.status} ${String(body.error ?? "")}`,
    );
  }

  const claims = jwt.decode(body.id_token);
  if (!claims || typeof claims !== "object") {
    throw new Error("google id token is not a jwt");
  }
  const c = claims as Record<string, unknown>;
  if (!ISSUERS.includes(String(c.iss))) throw new Error("wrong issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(cfg.googleClientId)) throw new Error("wrong audience");
  if (typeof c.exp !== "number" || c.exp * 1000 < Date.now()) {
    throw new Error("id token expired");
  }
  if (c.nonce !== st.nonce) throw new Error("nonce mismatch");
  if (typeof c.sub !== "string" || !c.sub) throw new Error("no subject");
  if (typeof c.email !== "string" || !c.email) throw new Error("no email");

  return {
    sub: c.sub,
    email: c.email,
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: typeof c.name === "string" ? c.name : "",
  };
}

/** next if it is a path on the storefront, else null (no open redirects). */
export function safeNextPath(next: unknown): string | null {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//")
  )
    return null;
  try {
    const base = "http://ohhobastra.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Google's name cut to the 50 characters a profile allows, or the email's local part. */
export function displayName(profile: GoogleProfile): string {
  const name = profile.name.trim() || profile.email.split("@")[0] || "Customer";
  return [...name].slice(0, 50).join("");
}
