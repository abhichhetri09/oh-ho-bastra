import { defineConfig } from "@hey-api/openapi-ts";

// Browser client (axios). Generated into src/generated and committed.
export default defineConfig({
  input: "../../apps/api/openapi.json",
  output: {
    path: "src/generated",
    clean: true,
    // No `.ts` import suffixes, so Next.js / bundler resolution stays happy.
    importFileExtension: null,
  },
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    { name: "@hey-api/client-axios", runtimeConfigPath: "./src/client-config" },
  ],
});
