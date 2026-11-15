// Options shared by the browser, Node and edge Sentry setups. The DSN is
// public (it only lets clients send events) and baked in at build time;
// without it Sentry stays off, as in development.
import type { BrowserOptions } from "@sentry/nextjs";

export const sentryOptions: BrowserOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  // A tenth of requests and page loads get a performance trace.
  tracesSampleRate: 0.1,
  // No cookies, headers, bodies, query strings or SQL values: an event says
  // what broke, not who it was or what they typed.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
  },
};
