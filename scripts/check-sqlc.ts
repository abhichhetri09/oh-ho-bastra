#!/usr/bin/env bun
/**
 * Runs sqlc generate, then fails if generated Go would change.
 * Keeps apps/api/internal/database/generated in sync with queries + migrations.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const generatedPath = "apps/api/internal/database/generated";

function run(command: string, args: string[], cwd?: string): number {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  return result.status ?? 1;
}

function hasGeneratedDrift(path: string): boolean {
  const diff = spawnSync("git", ["diff", "--exit-code", "--", path], {
    stdio: "inherit",
    shell: false,
  });
  if ((diff.status ?? 1) !== 0) {
    return true;
  }

  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", path],
    { encoding: "utf8", shell: false },
  );
  return (status.stdout ?? "")
    .split("\n")
    .some((line) => line.startsWith("??"));
}

// sqlc never deletes output for removed query files, so clear the generated
// dir first; a stale file then shows up as a deletion in the drift check.
for (const file of readdirSync(generatedPath)) {
  if (file.endsWith(".go")) rmSync(join(generatedPath, file));
}

const generateStatus = run("sqlc", ["generate"], "apps/api");
if (generateStatus !== 0) {
  console.error(`
sqlc generate failed. Install sqlc:
  go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0
`);
  process.exit(generateStatus);
}

if (hasGeneratedDrift(generatedPath)) {
  console.error(`
sqlc generated code is out of date.

Run:
  bun run db:sqlc

Then commit apps/api/internal/database/generated.
`);
  process.exit(1);
}

console.log("sqlc generated code is up to date.");
