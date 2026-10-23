import { defineConfig } from "vitest/config";

process.env.LOG_LEVEL ??= "silent";

// Integration tests run against a real Postgres (TEST_DATABASE_URL), one
// file at a time so they never share rows mid-test.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
