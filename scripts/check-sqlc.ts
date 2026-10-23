#!/usr/bin/env bun
/**
 * Regenerates the typed queries (sqlc + scripts/sqlc-ts.ts), then fails if
 * apps/api/src/db/gen would change. Keeps it in sync with
 * apps/api/queries and apps/api/migrations.
 */
import { spawnSync } from "node:child_process";

const generatedPath = "apps/api/src/db/gen";

const generate = spawnSync("bun", ["run", "sqlc"], {
  cwd: "apps/api",
  stdio: "inherit",
});
if ((generate.status ?? 1) !== 0) {
  console.error(`
Generating the queries failed. Install sqlc (https://docs.sqlc.dev):
  brew install sqlc
`);
  process.exit(generate.status ?? 1);
}

// The generator rewrites the whole directory, so a removed query file shows
// up as a deletion and a new one as an untracked file.
const diff = spawnSync("git", ["diff", "--exit-code", "--", generatedPath], {
  stdio: "inherit",
});
const untracked = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", generatedPath],
  {
    encoding: "utf8",
  },
);
const drift =
  (diff.status ?? 1) !== 0 ||
  (untracked.stdout ?? "").split("\n").some((line) => line.startsWith("??"));

if (drift) {
  console.error(`
The generated queries are out of date.

Run:
  bun run db:sqlc

Then commit ${generatedPath}.
`);
  process.exit(1);
}

console.log("Generated queries are up to date.");
