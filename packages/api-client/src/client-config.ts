import type { CreateClientConfig } from "./generated/client.gen";

// The spec's paths start with /api/v1, so baseURL is just the API origin; an
// explicit baseURL wins over NEXT_PUBLIC_API_URL (the generated default "/"
// doesn't count). Auth lives in HTTP-only cookies, so every browser request
// sends credentials.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseURL:
    config?.baseURL && config.baseURL !== "/"
      ? config.baseURL
      : (process.env.NEXT_PUBLIC_API_URL ?? ""),
  withCredentials: true,
});
