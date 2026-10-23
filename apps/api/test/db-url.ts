import { loadEnvFile } from "../src/config";

/**
 * The test database: TEST_DATABASE_URL, or DATABASE_URL pointed at
 * localhost and a separate ohhobastra_test database (ohhobastra_<suffix>_test
 * with TEST_DB_SUFFIX), so tests never touch development data.
 */
export function testDatabaseUrl(): string {
  loadEnvFile();
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error("set TEST_DATABASE_URL or DATABASE_URL to run the tests");
  const url = new URL(base);
  if (url.hostname === "db") url.hostname = "localhost";
  // TEST_DB_SUFFIX gives parallel runs their own database.
  const suffix = process.env.TEST_DB_SUFFIX?.replace(/[^a-z0-9_]/g, "");
  url.pathname = suffix ? `/ohhobastra_${suffix}_test` : "/ohhobastra_test";
  return url.toString();
}
