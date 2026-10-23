import { deleteStalePasswordResets, deleteStaleSessions } from "./db/gen";
import type { Deps } from "./deps";
import type { EmailWorker } from "./emails/worker";
import { log } from "./log";

const SESSION_CLEANUP_INTERVAL = 60 * 60_000;
const ORDER_EXPIRY_INTERVAL = 5 * 60_000;
const EMAIL_INTERVAL = 10_000;

/**
 * Runs `task` now and then every `interval` ms, never two at once. Resolves
 * the returned stop() once a run in flight has finished.
 */
function every(interval: number, task: () => Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();
  let stopped = false;
  const tick = () => {
    running = task().finally(() => {
      if (!stopped) timer = setTimeout(tick, interval);
    });
  };
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}

/**
 * The loops inside the API process: expired sessions and stale reset links
 * (hourly), checkouts whose reservation ran out without word from Stripe
 * (every 5 minutes), and the order email outbox (every 10 seconds).
 * Resolves the returned function once they've stopped.
 */
export function startBackgroundJobs(
  deps: Deps,
  emails: EmailWorker | null,
): () => Promise<void> {
  const stops = [
    every(SESSION_CLEANUP_INTERVAL, async () => {
      try {
        const sessions = await deleteStaleSessions(deps.db);
        if (sessions > 0) log.info("session cleanup", { deleted: sessions });
        // Reset links a day past their expiry, on the same schedule.
        const resets = await deleteStalePasswordResets(deps.db);
        if (resets > 0) log.info("password reset cleanup", { deleted: resets });
      } catch (err) {
        log.error("session cleanup failed", err);
      }
    }),
  ];
  if (deps.checkout.enabled()) {
    stops.push(
      every(ORDER_EXPIRY_INTERVAL, async () => {
        try {
          const released = await deps.checkout.releaseExpired();
          if (released > 0) log.info("order expiry", { released });
        } catch (err) {
          log.error("order expiry failed", err);
        }
      }),
    );
  }
  if (emails) {
    stops.push(
      every(EMAIL_INTERVAL, async () => {
        try {
          await emails.sendDue();
        } catch (err) {
          log.error("email outbox failed", err);
        }
      }),
    );
  }
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
  };
}
