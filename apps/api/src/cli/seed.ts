/**
 * Creates the seed admin and customer (idempotent). Passwords come from
 * SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD; an existing account is
 * left as it is, even when its role differs.
 */
import { hashPassword } from "../auth/password";
import { normalizeEmail } from "../auth/session";
import { loadConfig, loadEnvFile } from "../config";
import { createUser, getUserByEmail } from "../db/gen";
import { connectWithRetry } from "../db/pool";
import { log } from "../log";

function requirePassword(key: string): string {
  const v = process.env[key] ?? "";
  if (v.length < 8)
    throw new Error(`${key} must be set (at least 8 characters)`);
  return v;
}

const envOr = (key: string, fallback: string) =>
  process.env[key]?.trim() || fallback;

async function seed() {
  loadEnvFile();
  const cfg = loadConfig();
  if (!cfg.databaseUrl) throw new Error("config: DATABASE_URL is required");
  const users = [
    {
      name: envOr("SEED_ADMIN_NAME", "Admin User"),
      email: normalizeEmail(envOr("SEED_ADMIN_EMAIL", "admin@example.com")),
      password: requirePassword("SEED_ADMIN_PASSWORD"),
      role: "admin",
    },
    {
      name: envOr("SEED_CUSTOMER_NAME", "Customer User"),
      email: normalizeEmail(
        envOr("SEED_CUSTOMER_EMAIL", "customer@example.com"),
      ),
      password: requirePassword("SEED_CUSTOMER_PASSWORD"),
      role: "customer",
    },
  ];
  if (users[0]!.email === users[1]!.email) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_CUSTOMER_EMAIL must be different",
    );
  }

  const db = await connectWithRetry(cfg.databaseUrl);
  try {
    for (const u of users) {
      const existing = await getUserByEmail(db, u.email);
      if (existing) {
        if (existing.role !== u.role) {
          log.warn("seed user exists with a different role, NOT changing it", {
            email: existing.email,
            role: existing.role,
            seed_role: u.role,
          });
        } else {
          log.info("seed user already exists, skipping", {
            email: existing.email,
            role: existing.role,
          });
        }
        continue;
      }
      const created = await createUser(db, {
        name: u.name,
        email: u.email,
        password_hash: await hashPassword(u.password),
        role: u.role,
        image_url: null,
      });
      log.info("seeded user", {
        email: u.email,
        role: u.role,
        id: created?.id,
      });
    }
    log.info("seed complete", {
      admin_email: users[0]!.email,
      customer_email: users[1]!.email,
    });
  } finally {
    await db.end();
  }
}

seed().catch((err) => {
  log.error("seed failed", err);
  process.exit(1);
});
