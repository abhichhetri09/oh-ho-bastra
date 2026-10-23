import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app";
import { newAccessToken } from "../src/auth/tokens";
import type { Config } from "../src/config";
import { loadConfig } from "../src/config";
import { createUser, type User } from "../src/db/gen";
import { createPool, type Pool } from "../src/db/pool";
import { CheckoutService } from "../src/checkout/service";
import type { Deps } from "../src/deps";
import type { Cloudinary } from "../src/services/cloudinary";
import { testDatabaseUrl } from "./db-url";

process.env.LOG_LEVEL ??= "silent";

export const testConfig = (): Config => ({
  ...loadConfig(),
  production: false,
  databaseUrl: testDatabaseUrl(),
  jwtAccessSecret: "test-access-secret-0123456789abcdef0123456789",
  jwtRefreshSecret: "test-refresh-secret-0123456789abcdef012345678",
  frontendUrl: "http://localhost:3000",
  stripeSecretKey: "",
  stripeWebhookSecrets: [],
  smtpHost: "",
  cookieDomain: "",
  trustedProxies: [],
  openapiPath: "openapi.json",
});

/**
 * One app over the test database per test file, with every table emptied
 * before each test. Pass overrides for services a test needs (payments,
 * mail, ...).
 */
export function setupTestApp(overrides: Partial<Deps> = {}) {
  const cfg = testConfig();
  const db: Pool = createPool(cfg.databaseUrl);
  const deps: Deps = {
    cfg,
    db,
    cloudinary: fakeCloudinary(),
    payments: null,
    checkout: new CheckoutService(db, null, cfg.frontendUrl),
    mailer: null,
    ...overrides,
  };
  const { app, routes } = buildApp(deps);

  beforeEach(async () => {
    await resetDatabase(db);
  });
  afterAll(async () => {
    await db.end();
  });

  return { app, routes, db, cfg, deps, http: () => request(app) };
}

/** A Cloudinary that signs with a fixed secret and deletes nothing. */
export function fakeCloudinary(): Cloudinary & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    signUpload: (folder, timestamp) => ({
      cloud_name: "test-cloud",
      api_key: "key-123",
      allowed_formats: "jpg,png,webp,avif",
      folder,
      timestamp,
      signature: "test-signature",
    }),
    owns: (url, publicId) =>
      url.startsWith("https://res.cloudinary.com/test-cloud/image/upload/") &&
      url.includes(`/${publicId}.`),
    deleteImage: async (publicId) => {
      deleted.push(publicId);
    },
  };
}

/** Empties every table except the migration bookkeeping. */
export async function resetDatabase(db: Pool) {
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length) {
    await db.query(
      `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
}

export const TEST_PASSWORD = "secret123";

/** A user (customer by default) with TEST_PASSWORD, hashed cheaply. */
export async function makeUser(
  db: Pool,
  fields: Partial<Pick<User, "name" | "email" | "role" | "image_url">> = {},
): Promise<User> {
  const user = await createUser(db, {
    name: fields.name ?? "Ada Lovelace",
    email: fields.email ?? `user-${randomUUID().slice(0, 8)}@example.com`,
    password_hash: await bcrypt.hash(TEST_PASSWORD, 4),
    role: fields.role ?? "customer",
    image_url: fields.image_url ?? null,
  });
  if (!user) throw new Error("createUser returned no row");
  return user;
}

/** A Cookie header that signs in as user (an access token only). */
export function cookieFor(cfg: Config, user: User): string {
  return `access_token=${newAccessToken(cfg, user)}`;
}

/** A new user of the role and the Cookie header that signs in as them. */
export async function signIn(
  db: Pool,
  cfg: Config,
  role: "customer" | "admin" = "customer",
) {
  const user = await makeUser(db, { role });
  return { user, cookie: cookieFor(cfg, user) };
}
