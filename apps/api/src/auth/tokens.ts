import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Config } from "../config";
import type { User } from "../db/gen";

// Access tokens are short-lived and checked on every request; refresh tokens
// name the session ("token family") they belong to. The "typ" claim keeps one
// from ever being accepted as the other. The web app decodes the access
// claims, so their names are fixed.

export const TOKEN_ACCESS = "access";
export const TOKEN_REFRESH = "refresh";

export interface AccessClaims {
  user_id: string;
  role: string;
  email: string;
  name: string;
  image_url?: string;
  typ: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface RefreshClaims {
  user_id: string;
  family_id: string;
  typ: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** What the sessions table stores: raw refresh tokens never reach the db. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const seconds = (ms: number) => Math.floor(ms / 1000);

type TokenUser = Pick<User, "id" | "role" | "email" | "name" | "image_url">;

export function newAccessToken(cfg: Config, user: TokenUser): string {
  const now = Date.now();
  // Go's claim order: its own fields, then the registered ones.
  const claims: Record<string, unknown> = {
    user_id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  };
  if (user.image_url) claims.image_url = user.image_url; // omitempty
  claims.typ = TOKEN_ACCESS;
  claims.exp = seconds(now + cfg.accessTokenTtl);
  claims.iat = seconds(now);
  claims.jti = randomUUID();
  return jwt.sign(claims, cfg.jwtAccessSecret, { algorithm: "HS256" });
}

export function signRefresh(
  cfg: Config,
  userId: string,
  familyId: string,
  expiresAt: Date,
): string {
  const claims: RefreshClaims = {
    user_id: userId,
    family_id: familyId,
    typ: TOKEN_REFRESH,
    exp: seconds(expiresAt.getTime()),
    iat: seconds(Date.now()),
    jti: randomUUID(),
  };
  return jwt.sign(claims, cfg.jwtRefreshSecret, { algorithm: "HS256" });
}

/**
 * A fresh access/refresh pair. Every call uses a new random jti, so two pairs
 * are never byte-identical, even within the same second.
 */
export function newTokens(
  cfg: Config,
  user: TokenUser,
  familyId: string,
  refreshExpiresAt: Date,
): Tokens {
  return {
    accessToken: newAccessToken(cfg, user),
    refreshToken: signRefresh(cfg, user.id, familyId, refreshExpiresAt),
  };
}

/**
 * Verifies the signature, HS256 and expiry; exp is required. Like Go's
 * decoder, a string claim holding another JSON type fails the parse.
 */
function verify(
  token: string,
  secret: string,
  strings: string[],
): Record<string, unknown> {
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("token has no expiry");
  }
  const p = payload as Record<string, unknown>;
  for (const key of [...strings, "jti"]) {
    if (p[key] !== undefined && p[key] !== null && typeof p[key] !== "string") {
      throw new Error(`claim ${key} is not a string`);
    }
  }
  return p;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseAccess(token: string, secret: string): AccessClaims {
  const p = verify(token, secret, [
    "user_id",
    "role",
    "email",
    "name",
    "image_url",
    "typ",
  ]);
  if (p.typ !== TOKEN_ACCESS) throw new Error("not an access token");
  if (!str(p.user_id)) throw new Error("missing user_id");
  return {
    user_id: str(p.user_id),
    role: str(p.role),
    email: str(p.email),
    name: str(p.name),
    image_url: str(p.image_url) || undefined,
    typ: TOKEN_ACCESS,
    jti: str(p.jti),
    iat: Number(p.iat),
    exp: Number(p.exp),
  };
}

export function parseRefresh(token: string, secret: string): RefreshClaims {
  const p = verify(token, secret, ["user_id", "family_id", "typ"]);
  if (p.typ !== TOKEN_REFRESH) throw new Error("not a refresh token");
  if (!str(p.user_id) || !str(p.family_id))
    throw new Error("missing user_id or family_id");
  return {
    user_id: str(p.user_id),
    family_id: str(p.family_id),
    typ: TOKEN_REFRESH,
    jti: str(p.jti),
    iat: Number(p.iat),
    exp: Number(p.exp),
  };
}
