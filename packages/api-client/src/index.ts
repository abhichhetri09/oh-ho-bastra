// Browser client: axios, sends cookies (withCredentials).
export { client, type CreateClientConfig } from "./generated/client.gen";
export {
  createClient,
  createConfig,
  type Client,
  type Config,
} from "./generated/client";
export * from "./generated/sdk.gen";
export type * from "./generated/types.gen";
