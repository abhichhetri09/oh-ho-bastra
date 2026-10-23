import {
  adminGetOrder,
  adminGetOrderForUpdate,
  deliverOrder,
  getOrderPayment,
  recordRefund,
  refundOrder,
  restoreStock,
  shipOrder,
  type Order,
} from "../db/gen";
import { withTx, type Pool, type Tx } from "../db/pool";
import { enqueue } from "../emails/outbox";
import { log } from "../log";
import { RefusedError, type PaymentProvider } from "../services/payments";
import { Refusal } from "./refusal";
import { fulfil, release } from "./settle";

// What an admin does to an order after checkout: ship, deliver, cancel an
// unpaid one, refund a paid one. Each throws a Refusal for the admin
// handler to send as is (an unknown order, a move the status doesn't
// allow, Stripe declining), anything else is a 500.

/** Something an admin does to an order. */
export type Action = "ship" | "deliver" | "cancel" | "refund";

/**
 * The statuses each action applies to: an order moves pending → paid
 * (checkout) → shipped → delivered, an unpaid one can be cancelled, and a
 * paid one refunded at any later step.
 */
const FROM: Record<Action, readonly string[]> = {
  ship: ["paid"],
  deliver: ["shipped"],
  cancel: ["pending"],
  refund: ["paid", "shipped", "delivered"],
};

const DONE: Record<Action, string> = {
  ship: "shipped",
  deliver: "delivered",
  cancel: "cancelled",
  refund: "refunded",
};

/** How long a pending order holds its stock (and its Stripe page lives); Stripe's minimum is 30 minutes. */
export const RESERVATION_TTL_MS = 31 * 60_000;

/** Bounds a refund's Stripe call (the order row stays locked meanwhile). */
export const REFUND_TIMEOUT_MS = 45_000;

/** Whether the action applies to an order in this status. */
export function canApply(action: string, status: string): boolean {
  return Object.hasOwn(FROM, action) && FROM[action as Action].includes(status);
}

/** The 409 for an action the order's status doesn't allow. */
export function transitionRefusal(action: Action, status: string): Refusal {
  return new Refusal(
    409,
    "INVALID_ORDER_TRANSITION",
    `This order is ${status}, so it can't be ${DONE[action]}`,
  );
}

export const errOrderNotFound = new Refusal(
  404,
  "ORDER_NOT_FOUND",
  "Order not found",
);
export const errAlreadyPaid = new Refusal(
  409,
  "ORDER_ALREADY_PAID",
  "This order has just been paid, so it can't be cancelled. Refund it instead.",
);
export const errStripe = new Refusal(
  502,
  "PAYMENT_PROVIDER_ERROR",
  "Stripe didn't answer, so nothing was changed. Try again.",
);
export const errProcessing = new Refusal(
  409,
  "INVALID_ORDER_TRANSITION",
  "Stripe is still processing this order's payment. Try again once it settles.",
);
export const errOpening = new Refusal(
  409,
  "INVALID_ORDER_TRANSITION",
  "This checkout is still opening. Try again in a minute.",
);
export const errNoPayment = new Refusal(
  409,
  "INVALID_ORDER_TRANSITION",
  "No payment is recorded for this order, so there is nothing to refund",
);

/** What fulfilment needs from the checkout service. */
export interface FulfilmentContext {
  db: Pool;
  provider: PaymentProvider | null;
  now(): Date;
}

/** Locks the order, checks the action applies and runs apply. */
function change(
  ctx: FulfilmentContext,
  number: number,
  action: Action,
  apply: (tx: Tx, order: Order) => Promise<Order>,
): Promise<Order> {
  return withTx(ctx.db, async (tx) => {
    const order = await adminGetOrderForUpdate(tx, number);
    if (!order) throw errOrderNotFound;
    if (!canApply(action, order.status))
      throw transitionRefusal(action, order.status);
    return apply(tx, order);
  });
}

const must = (order: Order | null, what: string): Order => {
  if (!order) throw new Error(`${what}: no rows in result set`);
  return order;
};

/** Marks a paid order shipped, with its tracking number if there is one ("" for none). */
export function ship(
  ctx: FulfilmentContext,
  number: number,
  tracking: string,
): Promise<Order> {
  return change(ctx, number, "ship", async (tx, order) => {
    const shipped = must(
      await shipOrder(tx, { id: order.id, tracking_number: tracking || null }),
      "ship order",
    );
    await enqueue(tx, "order_shipped", order.id);
    return shipped;
  });
}

/** Marks a shipped order delivered. */
export function deliver(
  ctx: FulfilmentContext,
  number: number,
): Promise<Order> {
  return change(ctx, number, "deliver", async (tx, order) =>
    must(await deliverOrder(tx, order.id), "deliver order"),
  );
}

/**
 * Cancels an unpaid order and returns its stock. Its Stripe page is expired
 * first, so the shopper can't pay a cancelled order; if Stripe says it was
 * paid already, the order is settled as paid instead (ORDER_ALREADY_PAID).
 */
export async function cancelPending(
  ctx: FulfilmentContext,
  number: number,
): Promise<Order> {
  const order = await adminGetOrder(ctx.db, number);
  if (!order) throw errOrderNotFound;
  if (!canApply("cancel", order.status))
    throw transitionRefusal("cancel", order.status);

  // A pending order without a Stripe page is either still opening one
  // (start sets it after its transaction) or failed to: cancelling now
  // could leave a payable page behind, so wait until the reservation runs out.
  if (
    order.stripe_session_id === null &&
    ctx.now().getTime() - order.created_at.getTime() < RESERVATION_TTL_MS
  ) {
    throw errOpening;
  }

  if (order.stripe_session_id !== null && ctx.provider) {
    const sessionId = order.stripe_session_id;
    try {
      await ctx.provider.expireSession(sessionId);
    } catch (err) {
      // Expiring fails for a page that is already complete or expired.
      let session;
      try {
        session = await ctx.provider.getSession(sessionId);
      } catch (getErr) {
        log.error("checkout: cancel: stripe", err, {
          order: number,
          get_err: String(getErr),
        });
        throw errStripe;
      }
      if (session.paid) {
        await withTx(ctx.db, (tx) => fulfil(tx, session));
        throw errAlreadyPaid;
      }
      if (!session.expired) {
        // Complete but unpaid: a delayed payment method is settling.
        log.warn("checkout: cancel: session not expirable", {
          order: number,
          err: String(err),
        });
        throw errProcessing;
      }
    }
  }

  return change(ctx, number, "cancel", async (tx, order) => {
    await release(tx, order.id);
    return must(await adminGetOrder(tx, number), "get order");
  });
}

/**
 * Refunds a paid order in full through Stripe, and returns its stock when
 * restock is set (an order that never shipped, or came back). The order
 * stays locked across the Stripe call, and the refund is keyed by the
 * order, so a retry after a failure here can't refund twice. Once Stripe
 * is asked, the answer is recorded even if the admin's request goes away
 * (nothing here is tied to the request).
 */
export function refundPaid(
  ctx: FulfilmentContext,
  number: number,
  restock: boolean,
): Promise<Order> {
  return change(ctx, number, "refund", async (tx, order) => {
    const payment = await getOrderPayment(tx, order.id);
    if (!payment || payment.stripe_payment_intent_id === null)
      throw errNoPayment;
    if (!ctx.provider) throw new Error("refund: payments are not configured");

    let refundId: string;
    try {
      refundId = await withTimeout(
        ctx.provider.refund(
          payment.stripe_payment_intent_id,
          "refund-" + order.id,
        ),
        REFUND_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof RefusedError) {
        throw new Refusal(
          409,
          "REFUND_REFUSED",
          "Stripe refused the refund: " + err.reason,
        );
      }
      log.error("checkout: refund", err, { order: number });
      throw errStripe;
    }
    await recordRefund(tx, { id: payment.id, stripe_refund_id: refundId });
    if (restock) await restoreStock(tx, order.id);
    log.info("checkout: order refunded", { order: number, restock });
    const refunded = must(await refundOrder(tx, order.id), "refund order");
    await enqueue(tx, "order_refunded", order.id);
    return refunded;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
