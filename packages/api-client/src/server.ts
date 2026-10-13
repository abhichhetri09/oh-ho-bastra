// Server client: fetch. Cookies are not forwarded automatically, so create a
// request-scoped client with createServerClient({ headers: { cookie } }) and
// pass it to every call. The generated module singleton is intentionally not
// exported.
import {
  createClient,
  createConfig,
  type Client,
  type Config,
} from "./generated-server/client";
import type { ClientOptions } from "./generated-server/types.gen";
import { createClientConfig } from "./server-client-config";

export type { Client, Config };
export * from "./generated-server/sdk.gen";
export type * from "./generated-server/types.gen";

/** A fetch client for one server request, with the API base URL resolved. */
export function createServerClient(config: Config = {}): Client {
  return createClient(
    createClientConfig(
      createConfig<ClientOptions>(config as Config<ClientOptions>),
    ),
  );
}
