import { client } from "@repo/api-client";
import api from "@/lib/axios";

// Route every SDK call through the axios instance with the refresh
// interceptor. Import SDK functions from here, not from @repo/api-client, so
// this runs before the first request.
client.setConfig({ axios: api });

export * from "@repo/api-client";
