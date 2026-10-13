import "server-only";
import { createServerClient, type Client } from "@repo/api-client/server";

/** Every cached catalog read carries this tag (revalidateTag("catalog")). */
export const CATALOG_TAG = "catalog";
/** The cached store settings (the theme); expired when an admin saves. */
export const SETTINGS_TAG = "store-settings";

/**
 * A fetch client for public, cookie-free reads that go through Next's data
 * cache, so a popular page costs one API call per revalidate window instead
 * of one per visitor. The generated client passes fetch a Request, which
 * drops Next's `next` options, so they are added here.
 */
export function publicClient(
  revalidate: number,
  tags: string[] = [CATALOG_TAG],
): Client {
  const cachedFetch = (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, next: { revalidate, tags } });
  return createServerClient({ fetch: cachedFetch as typeof fetch });
}
