import { resolve } from "node:path";
import pg from "pg";
import { loadMigrations, migrateUp } from "../src/db/migrate";
import { testDatabaseUrl } from "./db-url";

/** Recreates the test database from the migrations once per run. */
export default async function setup() {
  process.env.LOG_LEVEL ??= "silent";
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.endsWith("_test")) {
    throw new Error(
      `refusing to recreate "${name}": the test database's name must end in _test`,
    );
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
  const pool = new pg.Pool({ connectionString: url.toString() });
  try {
    await migrateUp(
      pool,
      loadMigrations(resolve(import.meta.dirname, "../migrations")),
    );
  } finally {
    await pool.end();
  }
}
