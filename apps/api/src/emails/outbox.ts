import type { Queryable } from "../db/queryable";
import { enqueueEmail } from "../db/gen";

// The shopper's order emails. A status change queues its email in the same
// transaction (enqueue), and the sender (EmailWorker) delivers the queue
// with retries, so a slow or unreachable mail server never holds up a
// webhook or an admin, and a rolled-back change sends nothing.

/** Email kinds (email_outbox.kind). */
export const EMAIL_KINDS = [
  "order_confirmed",
  "order_shipped",
  "order_refunded",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/**
 * Queues an order email in tx's transaction. Each kind is sent once per
 * order, so a replayed webhook queues nothing new.
 */
export async function enqueue(
  tx: Queryable,
  kind: EmailKind,
  orderId: string,
): Promise<void> {
  if (!EMAIL_KINDS.includes(kind))
    throw new Error(`unknown email kind "${kind}"`);
  await enqueueEmail(tx, { kind, order_id: orderId });
}
