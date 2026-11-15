import * as Sentry from "@sentry/node";

/**
 * Error reporting to Sentry, on when SENTRY_DSN is set. Errors reach it
 * through log.error and rlog.error (log.ts), so whatever is logged as an
 * error is also reported: the 500 handler, handled failures, background
 * jobs. Unhandled rejections and exceptions are caught by the SDK itself.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || "production",
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
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
  });
}

/** Reports err with the log line's fields. A no-op while Sentry is off. */
export function reportError(
  msg: string,
  err: unknown,
  fields: Record<string, unknown> = {},
): void {
  if (!Sentry.isInitialized()) return;
  Sentry.withScope((scope) => {
    scope.setContext("log", { msg, ...fields });
    for (const key of ["path", "method", "request_id"] as const) {
      if (typeof fields[key] === "string") scope.setTag(key, fields[key]);
    }
    if (fields.actor_id !== undefined)
      scope.setUser({ id: String(fields.actor_id) });
    if (err instanceof Error) Sentry.captureException(err);
    else Sentry.captureMessage(`${msg}: ${String(err)}`, "error");
  });
}

/** Sends what's queued, for a clean exit. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (Sentry.isInitialized()) await Sentry.close(timeoutMs);
}
