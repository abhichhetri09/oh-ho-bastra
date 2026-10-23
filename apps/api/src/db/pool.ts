import pg from "pg";
import { log } from "../log";
import type { Queryable } from "./queryable";

// Counts and order numbers are bigint (int8); every value we store fits in
// 2^53, so they are parsed as numbers, as Go sends them. Dates stay
// "YYYY-MM-DD" strings instead of becoming local-midnight Date objects.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(1016 as never /* int8[] */, (v: string) =>
  v === "{}"
    ? []
    : v
        .slice(1, -1)
        .split(",")
        .map((n) => (n === "NULL" ? null : Number(n))),
);
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Pool = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString: string): Pool {
  const pool = new pg.Pool({
    connectionString,
    idleTimeoutMillis: 4 * 60_000,
  });
  // An idle client losing its connection (e.g. Postgres restarting) must not
  // crash the process; the pool replaces it.
  pool.on("error", (err) => log.error("idle database client failed", err));
  return pool;
}

/**
 * Connects, retrying every 2s (e.g. while the db container starts). A
 * malformed connection string fails at once.
 */
export async function connectWithRetry(
  connectionString: string,
  maxRetries = 10,
): Promise<Pool> {
  new URL(connectionString); // throws on a malformed DATABASE_URL
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const pool = createPool(connectionString);
    try {
      await pool.query("SELECT 1");
      return pool;
    } catch (err) {
      lastError = err;
      await pool.end().catch(() => {});
      log.warn("failed to connect to database, retrying...", {
        attempt,
        max: maxRetries,
        err: err instanceof Error ? err.message : String(err),
      });
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(
    `failed to open database after ${maxRetries} attempts: ${String(lastError)}`,
  );
}

/**
 * Runs fn in a transaction: committed when fn resolves, rolled back when it
 * throws (the error is rethrown).
 */
export async function withTx<T>(
  pool: Pool,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** The SQLSTATE of a Postgres error, if err is one. */
export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof err.code === "string"
    ? err.code
    : undefined;
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";

/** The violated constraint's name, for telling unique indexes apart. */
export function pgConstraint(err: unknown): string | undefined {
  return typeof err === "object" &&
    err !== null &&
    "constraint" in err &&
    typeof err.constraint === "string"
    ? err.constraint
    : undefined;
}

export type { Queryable };
