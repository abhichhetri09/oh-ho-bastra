import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Configuration from the environment. Locally every app reads the repo-root
// .env.local; in Docker and deploys the variables come from the host.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const SMTP_TLS_MODES = ["starttls", "tls", "none"] as const;
export type SmtpTls = (typeof SMTP_TLS_MODES)[number];

export interface Config {
  port: number;
  /** production: Secure cookies on COOKIE_DOMAIN, JSON logs. */
  production: boolean;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  frontendUrl: string;
  stripeSecretKey: string;
  /** The dashboard endpoint's signing secret and, in development, `stripe listen`'s. */
  stripeWebhookSecrets: string[];
  cookieDomain: string;
  openapiPath: string;
  /** Proxies allowed to set X-Forwarded-For; none by default. */
  trustedProxies: string[];
  // Order emails go out over SMTP; without SMTP_HOST they stay queued.
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpTls: string;
  mailFrom: string;
  // Sign in with Google; off unless all three are set.
  googleClientId: string;
  googleClientSecret: string;
  /** The API's callback, exactly as registered with Google. */
  googleRedirectUri: string;
  /** All durations in milliseconds. */
  accessTokenTtl: number;
  refreshTokenTtl: number;
  /** Grace for a request that lost a concurrent refresh. */
  refreshReuseWindow: number;
  /** Absolute session lifetime, however often it's refreshed. */
  maxSessionAge: number;
}

/** Loads the repo-root .env.local when there is one (local runs). */
export function loadEnvFile(): void {
  for (const file of ["../../.env.local", ".env.local"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

const env = (key: string) => (process.env[key] ?? "").trim();

const list = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export function loadConfig(): Config {
  const smtpPortRaw = env("SMTP_PORT");
  const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : 587;
  if (!Number.isInteger(smtpPort)) {
    throw new Error(`SMTP_PORT: "${smtpPortRaw}" is not a number`);
  }
  const port = Number(env("PORT") || 5000);

  return {
    port: Number.isInteger(port) ? port : 5000,
    production: process.env.NODE_ENV === "production",
    databaseUrl: env("DATABASE_URL"),
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
    cloudinaryCloudName: env("CLOUDINARY_CLOUD_NAME"),
    cloudinaryApiKey: env("CLOUDINARY_API_KEY"),
    cloudinaryApiSecret: env("CLOUDINARY_API_SECRET"),
    frontendUrl: env("FRONTEND_URL").replace(/\/+$/, ""),
    stripeSecretKey: env("STRIPE_SECRET_KEY"),
    stripeWebhookSecrets: [
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_WEBHOOK_SECRET_LOCAL",
    ]
      .map(env)
      .filter(Boolean),
    cookieDomain: env("COOKIE_DOMAIN"),
    openapiPath: env("OPENAPI_PATH") || "openapi.json",
    trustedProxies: list(env("TRUSTED_PROXIES")),
    smtpHost: env("SMTP_HOST"),
    smtpPort,
    smtpUsername: process.env.SMTP_USERNAME ?? "",
    smtpPassword: process.env.SMTP_PASSWORD ?? "",
    smtpTls: env("SMTP_TLS").toLowerCase() || "starttls",
    mailFrom: env("MAIL_FROM"),
    googleClientId: env("GOOGLE_CLIENT_ID"),
    googleClientSecret: env("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: env("GOOGLE_REDIRECT_URI"),
    accessTokenTtl: 15 * MINUTE,
    refreshTokenTtl: 30 * DAY,
    refreshReuseWindow: 30_000,
    maxSessionAge: 90 * DAY,
  };
}

/** HMAC keys for HS256 must be at least 32 bytes. */
const MIN_JWT_SECRET_LEN = 32;

/**
 * Fails fast on JWT secrets that would make tokens forgeable: empty or short
 * keys, or one key shared by access and refresh tokens.
 */
export function validateAuth(cfg: Config): void {
  if (
    cfg.jwtAccessSecret.length < MIN_JWT_SECRET_LEN ||
    cfg.jwtRefreshSecret.length < MIN_JWT_SECRET_LEN
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters (openssl rand -hex 32)",
    );
  }
  if (cfg.jwtAccessSecret === cfg.jwtRefreshSecret) {
    throw new Error(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different",
    );
  }
}

export const googleEnabled = (cfg: Config) =>
  Boolean(
    cfg.googleClientId &&
    cfg.googleClientSecret &&
    cfg.googleRedirectUri &&
    cfg.frontendUrl,
  );

export const mailEnabled = (cfg: Config) => cfg.smtpHost !== "";

// An address alone or "Name <address>", with one @ and a dot in the domain.
const MAIL_FROM = /^(?:[^<>]*<\s*)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+(?:\s*>)?$/;

/**
 * Fails fast on an SMTP setup that could never send: no or a malformed
 * sender, an unknown TLS mode or a bad port. Without SMTP_HOST mail is off
 * and nothing is checked.
 */
export function validateMail(cfg: Config): void {
  if (!mailEnabled(cfg)) return;
  if (!cfg.mailFrom) {
    throw new Error(
      "MAIL_FROM is required when SMTP_HOST is set (e.g. Oh Ho Bastra <orders@example.com>)",
    );
  }
  if (!MAIL_FROM.test(cfg.mailFrom)) {
    throw new Error(`MAIL_FROM "${cfg.mailFrom}" is not an email address`);
  }
  if (!(SMTP_TLS_MODES as readonly string[]).includes(cfg.smtpTls)) {
    throw new Error(
      `SMTP_TLS must be starttls, tls or none, not "${cfg.smtpTls}"`,
    );
  }
  if (cfg.smtpPort < 1 || cfg.smtpPort > 65535) {
    throw new Error(`SMTP_PORT ${cfg.smtpPort} is out of range`);
  }
  if (cfg.smtpUsername && !cfg.smtpPassword) {
    throw new Error("SMTP_PASSWORD is required with SMTP_USERNAME");
  }
}
