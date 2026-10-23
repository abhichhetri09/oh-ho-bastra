/**
 * Applies the database migrations in migrations/.
 *
 *   migrate              apply every pending migration (same as "up")
 *   migrate up
 *   migrate down N       roll back the last N migrations
 *   migrate version      print the current version
 *   migrate force V      mark version V as applied and clean, after a
 *                        failed migration was fixed by hand
 *
 * Reads DATABASE_URL from the environment (or the repo-root .env.local).
 * Exits 1 on any error, so `migrate up && start` never starts the server on
 * a schema that failed to migrate.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../config";
import {
  loadMigrations,
  migrateDown,
  migrateForce,
  migrateUp,
  migrationVersion,
} from "../db/migrate";
import { createPool } from "../db/pool";
import { log } from "../log";

const USAGE = "usage: migrate [up | down N | version | force V]";

async function run(args: string[]) {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const [command = "up", arg, ...rest] = args;
  let n = 0;
  if (command === "down" || command === "force") {
    if (arg === undefined || rest.length) throw new Error(USAGE);
    n = Number(arg);
    if (!Number.isInteger(n) || n < -1 || (command === "down" && n < 1)) {
      throw new Error(`${command}: "${arg}" is not a valid number (${USAGE})`);
    }
  } else if (command === "up" || command === "version") {
    if (arg !== undefined) throw new Error(USAGE);
  } else {
    throw new Error(USAGE);
  }

  const migrations = loadMigrations(
    resolve(process.env.MIGRATIONS_DIR ?? "migrations"),
  );
  const pool = createPool(url);
  try {
    if (command === "up") {
      const ran = await migrateUp(pool, migrations);
      if (ran === 0) log.info("no pending migrations");
    } else if (command === "down") {
      await migrateDown(pool, migrations, n);
    } else if (command === "force") {
      await migrateForce(pool, n);
    }
    const v = await migrationVersion(pool);
    if (v.version === null) log.info("database has no migrations applied");
    else if (v.dirty)
      throw new Error(
        `database is dirty at version ${v.version}: fix the failed migration, then run \`migrate force ${v.version}\``,
      );
    else log.info("database is at", { version: v.version });
  } finally {
    await pool.end();
  }
}

run(process.argv.slice(2)).catch((err) => {
  log.error("migrate failed", err);
  process.exit(1);
});
