import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

// Server and edge (proxy.ts) error reporting. The browser side is in
// instrumentation-client.ts.
export function register() {
  Sentry.init(sentryOptions);
}

// Errors thrown while rendering server components, route handlers and
// server actions.
export const onRequestError = Sentry.captureRequestError;
