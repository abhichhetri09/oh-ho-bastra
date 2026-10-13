import { defineConfig } from "@hey-api/openapi-ts";

// Server client (fetch) for Next.js server components and route handlers.
// Generated into src/generated-server and committed.
export default defineConfig({
  input: "../../apps/api/openapi.json",
  output: {
    path: "src/generated-server",
    clean: true,
    importFileExtension: null,
  },
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    {
      name: "@hey-api/client-fetch",
      runtimeConfigPath: "./src/server-client-config",
    },
  ],
});
