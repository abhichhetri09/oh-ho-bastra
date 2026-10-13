import type { CreateClientConfig } from "./generated-server/client.gen";

// Server-side code should reach the API on the internal network (in Docker,
// http://api:5000), which the browser-facing NEXT_PUBLIC_API_URL may not
// resolve to. An explicit baseUrl wins, then INTERNAL_API_URL, then the
// public URL. The generated default baseUrl is the spec's relative server
// "/", which means nothing outside a browser, so it doesn't count.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl:
    config?.baseUrl && config.baseUrl !== "/"
      ? config.baseUrl
      : process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "",
});
