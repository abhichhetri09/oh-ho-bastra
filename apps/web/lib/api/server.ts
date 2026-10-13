import { cookies } from "next/headers";
import { createServerClient, type Client } from "@repo/api-client/server";

/**
 * A fetch client for server components and route handlers that forwards the
 * request's cookies. Its base URL is INTERNAL_API_URL when set (the API's
 * address inside Docker), else NEXT_PUBLIC_API_URL. There is no refresh
 * here: proxy.ts refreshes on guarded routes, elsewhere an expired access
 * token just gets a 401.
 */
export async function serverClient(): Promise<Client> {
  const cookie = (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  return createServerClient(cookie ? { headers: { cookie } } : {});
}
