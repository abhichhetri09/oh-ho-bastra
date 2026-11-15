import { GUEST_TTL_MS } from "./auth/guest";
import {
  deleteStaleGuests,
  deleteStalePasswordResets,
  deleteStaleSessions,
} from "./db/gen";
import type { Queryable } from "./db/queryable";
import type { Deps } from "./deps";
import { onEmailsNudged } from "./emails/outbox";
import type { EmailWorker } from "./emails/worker";
import { log } from "./log";
import { settleCredit } from "./referrals/credit";

// Every loop touches the database, and a serverless Postgres (Neon) only
// scales to zero after ~5 idle minutes, so nothing here runs more often
// than hourly while the shop is quiet.
const HOURLY = 60 * 60_000;
// Checkouts past their reservation are also released when a checkout
// starts and by Stripe's checkout.session.expired webhook; this is the
// backstop for a missed webhook.
const ORDER_EXPIRY_INTERVAL = HOURLY;
// The outbox is checked hourly (retries, mail that was down), and right
// after an email is queued: every EMAIL_BURST_INTERVAL for EMAIL_BURST_MS,
// which covers the queueing transaction committing a little later.
const EMAIL_IDLE_INTERVAL = HOURLY;
const EMAIL_BURST_INTERVAL = 10_000;
const EMAIL_BURST_MS = 2 * 60_000;

/**
 * Runs `task` now and then every `interval` ms (or after `interval()` ms,
 * asked after each run), never two at once. wake() runs it as soon as the
 * run in flight (if any) is done. stop() resolves once that run finishes.
 */
function every(interval: number | (() => number), task: () => Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | null = null;
  let wakeAfter = false;
  let stopped = false;
  const next = () => (typeof interval === "number" ? interval : interval());
  const tick = () => {
    clearTimeout(timer);
    running = task().finally(() => {
      running = null;
      if (stopped) return;
      if (wakeAfter) {
        wakeAfter = false;
        tick();
      } else timer = setTimeout(tick, next());
    });
  };
  tick();
  return {
    wake() {
      if (stopped) return;
      if (running) wakeAfter = true;
      else tick();
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}

/**
 * The hourly cleanup: expired sessions, reset links a day past their
 * expiry, and guests nobody can use any more (older than GUEST_TTL_MS,
 * never ordered, no live session; their carts go with them). Resolves to
 * how many of each were deleted.
 */
export async function cleanUp(db: Queryable, now = new Date()) {
  const sessions = await deleteStaleSessions(db);
  if (sessions > 0) log.info("session cleanup", { deleted: sessions });
  const resets = await deleteStalePasswordResets(db);
  if (resets > 0) log.info("password reset cleanup", { deleted: resets });
  const guests = await deleteStaleGuests(
    db,
    new Date(now.getTime() - GUEST_TTL_MS),
  );
  if (guests > 0) log.info("guest cleanup", { deleted: guests });
  return { sessions, resets, guests };
}

/**
 * The loops inside the API process: expired sessions, stale reset links
 * and unused guests (hourly), referral payouts and lapsed store credit
 * (hourly), checkouts whose reservation ran out without word from Stripe
 * (hourly), and the order email outbox (hourly, and in a short burst
 * after an email is queued).
 * Resolves the returned function once they've stopped.
 */
export function startBackgroundJobs(
  deps: Deps,
  emails: EmailWorker | null,
): () => Promise<void> {
  const stops = [
    every(HOURLY, async () => {
      try {
        await cleanUp(deps.db);
      } catch (err) {
        log.error("session cleanup failed", err);
      }
    }),
    every(HOURLY, async () => {
      try {
        await settleCredit(deps.db);
      } catch (err) {
        log.error("store credit job failed", err);
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
  let unsubscribe = () => {};
  if (emails) {
    let burstUntil = 0;
    const outbox = every(
      () =>
        Date.now() < burstUntil ? EMAIL_BURST_INTERVAL : EMAIL_IDLE_INTERVAL,
      async () => {
        try {
          // Something was due: look again soon, there may be more.
          if ((await emails.sendDue()) > 0)
            burstUntil = Math.max(burstUntil, Date.now() + EMAIL_BURST_MS);
        } catch (err) {
          log.error("email outbox failed", err);
        }
      },
    );
    unsubscribe = onEmailsNudged(() => {
      burstUntil = Date.now() + EMAIL_BURST_MS;
      // Give the queueing transaction a moment to commit.
      setTimeout(() => outbox.wake(), 1_000).unref();
    });
    stops.push(outbox);
  }
  return async () => {
    unsubscribe();
    await Promise.all(stops.map((s) => s.stop()));
  };
}
