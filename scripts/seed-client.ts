// What the seed scripts share: signing in to the running API as the seed
// admin, and reading what the catalog already has so a rerun skips it.
import {
  adminListProducts,
  createServerClient,
  login,
  type Client,
} from "../packages/api-client/src/server.ts";

export function fail(step: string, error: unknown): never {
  throw new Error(`${step} failed: ${JSON.stringify(error)}`);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export async function signIn(baseUrl: string): Promise<Client> {
  const { data, error, response } = await login({
    client: createServerClient({ baseUrl }),
    body: {
      email: requireEnv("SEED_ADMIN_EMAIL"),
      password: requireEnv("SEED_ADMIN_PASSWORD"),
    },
  });
  if (!data) fail("login", error);
  if (data.data.role !== "admin")
    throw new Error("SEED_ADMIN_EMAIL is not an admin");

  const access = response.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0] ?? "")
    .find((c) => c.startsWith("access_token="));
  if (!access) throw new Error("login set no access_token cookie");
  return createServerClient({ baseUrl, headers: { cookie: access } });
}

/** The catalog's products, name → id. */
export async function existingProducts(
  client: Client,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await adminListProducts({
      client,
      query: { page },
    });
    if (!data) fail("list products", error);
    data.data.forEach((p) => byName.set(p.name, p.id));
    if (page >= data.meta.total_pages) return byName;
  }
}
