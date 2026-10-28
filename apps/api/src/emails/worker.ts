import {
  claimDueEmails,
  failEmail,
  getEmailOrder,
  getOrderItems,
  markEmailSent,
  retryEmail,
  type EmailOutbox,
} from "../db/gen";
import type { Queryable } from "../db/queryable";
import { log } from "../log";
import { PermanentError, type Mailer, type Message } from "./mailer";
import { render } from "./render";

// BATCH_SIZE emails are claimed per round, each leased for LEASE: long
// enough to send them all even if every send takes the mailer's timeouts.
export const BATCH_SIZE = 10;
const LEASE_SECONDS = 10 * 60;
// A failed send is retried after 1m, 2m, 4m... (at most MAX_BACKOFF), and
// given up after MAX_ATTEMPTS.
const FIRST_BACKOFF = 60_000;
const MAX_BACKOFF = 60 * 60_000;
export const MAX_ATTEMPTS = 8;
// An email still unsent after MAX_AGE is dropped: after mail was down for
// days, an "order confirmed" for an order that has since shipped would only
// confuse.
export const MAX_AGE = 48 * 60 * 60_000;
// LAST_ERROR_LEN caps the error kept on the row (bytes).
export const LAST_ERROR_LEN = 500;

/** Delivers the email outbox (order confirmed, shipped, refunded). */
export class EmailWorker {
  constructor(
    readonly db: Queryable,
    readonly mailer: Mailer,
    readonly frontendUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Sends rounds of due emails until none are left, and resolves to how
   * many it claimed. An aborted signal stops it between emails: the rest go
   * back to the queue when their lease ends.
   */
  async sendDue(signal?: AbortSignal): Promise<number> {
    let total = 0;
    while (!signal?.aborted) {
      const n = await this.sendRound(signal);
      total += n;
      if (n < BATCH_SIZE) break;
    }
    return total;
  }

  /** Claims a batch of due emails and tries each once. */
  async sendRound(signal?: AbortSignal): Promise<number> {
    let rows: EmailOutbox[];
    try {
      rows = await claimDueEmails(this.db, {
        lease_seconds: LEASE_SECONDS,
        batch: BATCH_SIZE,
      });
    } catch (err) {
      throw new Error(`claim: ${errorMessage(err)}`, { cause: err });
    }
    for (const row of rows) {
      if (signal?.aborted) break;
      await this.deliver(row, signal);
    }
    return rows.length;
  }

  /**
   * Sends one claimed email and records the outcome. The outcome is
   * recorded even if shutdown starts mid-send: an email that went out must
   * not stay pending, or it is sent again.
   */
  private async deliver(row: EmailOutbox, signal?: AbortSignal) {
    const fields: Record<string, unknown> = {
      email: row.kind,
      attempt: row.attempts,
    };

    if (this.now().getTime() - queuedAt(row).getTime() > MAX_AGE) {
      log.warn("emails: dropped, too old to send", fields);
      await this.fail(row, "not sent within 48 hours");
      return;
    }

    let err: unknown = null;
    try {
      const { msg, number } = await this.compose(row);
      fields.order = number;
      await this.mailer.send(msg);
    } catch (e) {
      err = e;
    }

    if (err === null) {
      try {
        await markEmailSent(this.db, row.id);
      } catch (e) {
        log.error("emails: sent but not recorded", e, fields);
        return;
      }
      log.info("emails: sent", fields);
    } else if (signal?.aborted) {
      // Shutting down: it is taken again when its lease runs out.
      log.info("emails: interrupted by shutdown", {
        ...fields,
        err: errorMessage(err),
      });
    } else if (err instanceof PermanentError) {
      log.error("emails: can't be sent", err, fields);
      await this.fail(row, err.message);
    } else if (row.attempts >= MAX_ATTEMPTS) {
      log.error("emails: giving up", err, fields);
      await this.fail(row, errorMessage(err));
    } else {
      const delay = backoff(row.attempts);
      log.warn("emails: send failed, will retry", {
        ...fields,
        err: errorMessage(err),
        in_ms: delay,
      });
      try {
        await retryEmail(this.db, {
          delay_seconds: delay / 1000,
          last_error: errorText(errorMessage(err)),
          id: row.id,
        });
      } catch (e) {
        log.error("emails: schedule retry", e, fields);
      }
    }
  }

  /**
   * Renders the email from the order as it is now. Loading the order can
   * fail for a while (the database); rendering it fails for good.
   */
  private async compose(
    row: EmailOutbox,
  ): Promise<{ msg: Message; number: number }> {
    let order;
    try {
      order = await getEmailOrder(this.db, row.order_id);
    } catch (err) {
      throw new Error(`get order: ${errorMessage(err)}`, { cause: err });
    }
    if (!order) throw new Error("get order: no rows in result set");
    let items;
    try {
      items = await getOrderItems(this.db, row.order_id);
    } catch (err) {
      throw new Error(`get items: ${errorMessage(err)}`, { cause: err });
    }
    let r;
    try {
      r = render(
        row.kind,
        order.order,
        order.customer_name,
        items,
        this.frontendUrl,
        { guest: order.guest },
      );
    } catch (err) {
      // A template or kind error fails the same way every time.
      throw new PermanentError(errorMessage(err), { cause: err });
    }
    return {
      msg: {
        to: order.order.email,
        subject: r.subject,
        html: r.html,
        text: r.text,
      },
      number: order.order.number,
    };
  }

  private async fail(row: EmailOutbox, reason: string) {
    try {
      await failEmail(this.db, { last_error: errorText(reason), id: row.id });
    } catch (err) {
      log.error("emails: mark failed", err, { email: row.kind });
    }
  }
}

/** The wait in ms before retrying after the given attempt (1-based). */
export function backoff(attempt: number): number {
  let d = FIRST_BACKOFF;
  for (let i = 1; i < attempt && d < MAX_BACKOFF; i++) d *= 2;
  return Math.min(d, MAX_BACKOFF);
}

/**
 * s cut to LAST_ERROR_LEN bytes. A cut can split a character, and Postgres
 * rejects invalid UTF-8, so the cut backs up to a character boundary.
 */
export function errorText(s: string): string {
  const bytes = Buffer.from(s, "utf8");
  if (bytes.length <= LAST_ERROR_LEN) return s;
  let end = LAST_ERROR_LEN;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}

/**
 * When the email's current run of attempts began: when it was queued, or
 * when an admin last sent it back to the queue.
 */
const queuedAt = (row: EmailOutbox) => row.requeued_at ?? row.created_at;

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);
