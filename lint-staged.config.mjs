/** @type {import("lint-staged").Configuration} */
export default {
  "apps/web/**/*.{js,jsx,ts,tsx,mjs,cjs}": (filenames) => [
    `bunx eslint --fix --max-warnings=0 -c apps/web/eslint.config.js ${filenames.join(" ")}`,
    `bunx prettier --write ${filenames.join(" ")}`,
  ],
  // Keep the OpenAPI spec and typed client in sync when the contract or the
  // generator config changes. Prettier runs here, before generating, rather
  // than in the generic rule below, so the two never touch a file at once.
  // The generated files aren't part of the staged set, so stage them here.
  "packages/{types/src,openapi/src,api-client}/**/*.ts": (filenames) => {
    const sources = filenames.filter((f) => !f.includes("/src/generated"));
    return [
      ...(sources.length ? [`bunx prettier --write ${sources.join(" ")}`] : []),
      "bun run generate",
      "git add apps/api/openapi.json packages/api-client/src/generated packages/api-client/src/generated-server",
    ];
  },
  // Keep the typed queries in sync when queries/schema change.
  "apps/api/{sqlc.yml,queries/**/*.sql,migrations/**/*.sql}": () => [
    "bun run db:sqlc",
    "git add apps/api/src/db/gen",
  ],
  // Skips files another rule already formats, so two prettier runs never
  // write the same file concurrently.
  "*.{js,jsx,ts,tsx,mjs,cjs,json,yml,yaml,css}": (filenames) => {
    const files = filenames.filter(
      (f) =>
        !/\/packages\/(types\/src|openapi\/src|api-client)\/.*\.ts$/.test(f) &&
        !/\/apps\/web\/.*\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f) &&
        !/\/apps\/api\/src\/db\/gen\//.test(f),
    );
    return files.length ? [`bunx prettier --write ${files.join(" ")}`] : [];
  },
};
