import { defineConfig } from "tsup";

// One bundle per entrypoint. The workspace packages (@repo/types) ship
// TypeScript source, so they are bundled in; npm dependencies stay external.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    migrate: "src/cli/migrate.ts",
    seed: "src/cli/seed.ts",
  },
  format: "esm",
  platform: "node",
  target: "node22",
  noExternal: [/^@repo\//],
  sourcemap: true,
  clean: true,
});
