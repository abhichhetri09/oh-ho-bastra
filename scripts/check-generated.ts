#!/usr/bin/env bun
/**
 * Regenerates the OpenAPI spec and the api-client, then fails if any
 * generated file would change. Keeps apps/api/openapi.json and
 * packages/api-client/src/generated{,-server} in sync with @repo/types and
 * @repo/openapi. (The Go contract test then checks the spec against the
 * API's routes and error codes.)
 */
import { spawnSync } from "node:child_process";

const generatedPaths = [
  "apps/api/openapi.json",
  "packages/api-client/src/generated",
  "packages/api-client/src/generated-server",
];

function hasGeneratedDrift(paths: string[]): boolean {
  const diff = spawnSync("git", ["diff", "--exit-code", "--", ...paths], {
    stdio: "inherit",
    shell: false,
  });
  if ((diff.status ?? 1) !== 0) {
    return true;
  }

  // Catch brand-new generated files, which git diff alone would miss.
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", ...paths],
    { encoding: "utf8", shell: false },
  );
  return (status.stdout ?? "")
    .split("\n")
    .some((line) => line.startsWith("??"));
}

// openapi-ts cleans its output dirs, so removed operations show up as
// deletions rather than lingering stale files.
const generate = spawnSync("bun", ["run", "generate"], {
  stdio: "inherit",
  shell: false,
});
if ((generate.status ?? 1) !== 0) {
  process.exit(generate.status ?? 1);
}

if (hasGeneratedDrift(generatedPaths)) {
  console.error(`
The generated OpenAPI spec or api-client is out of date.

Run:
  bun run generate

Then commit apps/api/openapi.json and packages/api-client/src/generated*.
`);
  process.exit(1);
}

console.log("Generated OpenAPI spec and api-client are up to date.");
