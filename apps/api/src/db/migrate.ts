import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { log } from "../log";

// Applies migrations/NNNNNN_name.{up,down}.sql. Versions are recorded in
// schema_migrations exactly as golang-migrate does (one row: version,
// dirty), so a database the Go migrator or the golang-migrate CLI managed
// carries on where it was. A Postgres advisory lock lets instances starting
// together migrate once while the rest wait. Each file runs as one implicit
// transaction (a multi-statement query), as golang-migrate ran it.

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

const FILE = /^(\d+)_(.+)\.(up|down)\.sql$/;

export function loadMigrations(dir: string): Migration[] {
  const byVersion = new Map<number, Partial<Migration>>();
  for (const file of readdirSync(dir)) {
    const m = FILE.exec(file);
    if (!m) continue;
    const version = Number(m[1]);
    const entry = byVersion.get(version) ?? { version, name: m[2] };
    entry[m[3] as "up" | "down"] = readFileSync(join(dir, file), "utf8");
    byVersion.set(version, entry);
  }
  return [...byVersion.values()]
    .map((m) => {
      if (m.up === undefined || m.down === undefined) {
        throw new Error(
          `migration ${m.version}_${m.name} needs both an .up.sql and a .down.sql`,
        );
      }
      return m as Migration;
    })
    .sort((a, b) => a.version - b.version);
}

export interface Version {
  version: number | null;
  dirty: boolean;
}

const LOCK = "SELECT pg_advisory_lock(hashtext('ohhobastra:migrations'))";
const UNLOCK = "SELECT pg_advisory_unlock(hashtext('ohhobastra:migrations'))";

async function ensureTable(c: PoolClient) {
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version bigint NOT NULL PRIMARY KEY, dirty boolean NOT NULL)",
  );
}

async function readVersion(c: PoolClient): Promise<Version> {
  const { rows } = await c.query<{ version: string; dirty: boolean }>(
    "SELECT version::text, dirty FROM schema_migrations LIMIT 1",
  );
  return rows[0]
    ? { version: Number(rows[0].version), dirty: rows[0].dirty }
    : { version: null, dirty: false };
}

async function setVersion(
  c: PoolClient,
  version: number | null,
  dirty: boolean,
) {
  await c.query("BEGIN");
  await c.query("TRUNCATE schema_migrations");
  if (version !== null) {
    await c.query(
      "INSERT INTO schema_migrations (version, dirty) VALUES ($1, $2)",
      [version, dirty],
    );
  }
  await c.query("COMMIT");
}

async function locked<T>(
  pool: Pool,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(LOCK);
    try {
      await ensureTable(c);
      return await fn(c);
    } finally {
      await c.query(UNLOCK);
    }
  } finally {
    c.release();
  }
}

function dirtyError(v: Version): Error {
  return new Error(
    `database is dirty at version ${v.version}: fix the failed migration, then run \`migrate force ${v.version}\` (or the version before it)`,
  );
}

/** Applies every pending migration; resolves to how many ran. */
export function migrateUp(
  pool: Pool,
  migrations: Migration[],
): Promise<number> {
  return locked(pool, async (c) => {
    const current = await readVersion(c);
    if (current.dirty) throw dirtyError(current);
    const pending = migrations.filter(
      (m) => current.version === null || m.version > current.version,
    );
    for (const m of pending) {
      await setVersion(c, m.version, true);
      await c.query(m.up);
      await setVersion(c, m.version, false);
      log.info("migrated", { version: m.version, name: m.name });
    }
    return pending.length;
  });
}

/** Rolls back the last n migrations. */
export function migrateDown(
  pool: Pool,
  migrations: Migration[],
  n: number,
): Promise<number> {
  return locked(pool, async (c) => {
    const current = await readVersion(c);
    if (current.dirty) throw dirtyError(current);
    let done = 0;
    let version = current.version;
    while (done < n && version !== null) {
      const at = migrations.findIndex((m) => m.version === version);
      if (at === -1)
        throw new Error(
          `no migration file for the database's version ${version}`,
        );
      const m = migrations[at]!;
      const previous = at > 0 ? migrations[at - 1]!.version : null;
      await setVersion(c, m.version, true);
      await c.query(m.down);
      await setVersion(c, previous, false);
      log.info("rolled back", { version: m.version, name: m.name });
      version = previous;
      done++;
    }
    return done;
  });
}

/** Marks version as applied and clean, after a failed migration was fixed by hand. */
export function migrateForce(pool: Pool, version: number): Promise<void> {
  return locked(pool, (c) =>
    setVersion(c, version === -1 ? null : version, false),
  );
}

export function migrationVersion(pool: Pool): Promise<Version> {
  return locked(pool, readVersion);
}
