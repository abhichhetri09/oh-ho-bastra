import {
  cancelPendingOrder,
  clearPaidCartCoupon,
  createPayment,
  deleteOrderRedemption,
  getOrderForUpdate,
  markOrderPaid,
  removeOrderedCartLines,
  restoreCouponRedemption,
  restoreStock,
  retakeStock,
  setItemShortfall,
} from "../db/gen";
import type { Queryable } from "../db/queryable";
import { enqueue } from "../emails/outbox";
import { isUuid } from "../http/params";
import { log } from "../log";
import type { Session } from "../services/payments";

// Settling orders inside a caller's transaction: shared by checkout and
// fulfilment.

/** The order id in a session's metadata, or null when it isn't one. */
export const sessionOrderId = (session: Session) =>
  isUuid(session.orderId) ? session.orderId.toLowerCase() : null;

/**
 * Cancels the order if it is still pending and then returns its stock and
 * its discount code's use; resolves to whether it did.
 */
export async function release(
  tx: Queryable,
  orderId: string,
): Promise<boolean> {
  if ((await cancelPendingOrder(tx, orderId)) === 0) return false;
  await restoreStock(tx, orderId);
  await deleteOrderRedemption(tx, orderId);
  return true;
}

/**
 * Marks the session's order paid, once. An order cancelled before the money
 * arrived (its page was replaced or ran out) takes its stock back, as far
 * as there is any (a shortfall is logged as oversold), and its code's use,
 * even past the code's limits: the discount was given.
 */
export async function fulfil(tx: Queryable, session: Session): Promise<void> {
  const orderId = sessionOrderId(session);
  if (orderId === null) {
    log.warn("checkout: paid session without an order", {
      session: session.id,
    });
    return;
  }
  const order = await getOrderForUpdate(tx, orderId);
  if (!order) {
    log.warn("checkout: paid session for an unknown order", {
      session: session.id,
      order_id: session.orderId,
    });
    return;
  }

  switch (order.status) {
    case "pending":
      break;
    case "cancelled": {
      const short = await retakeStock(tx, order.id);
      for (const row of short) {
        // A refund with restock then returns only what was taken.
        await setItemShortfall(tx, {
          order_id: order.id,
          variant_id: row.id,
          shortfall: row.shortfall,
        });
      }
      if (short.length > 0) {
        log.error("checkout: paid after release, oversold", undefined, {
          order: order.number,
          variants: short.length,
        });
      }
      if (order.coupon_code !== null)
        await restoreCouponRedemption(tx, order.id);
      break;
    }
    default:
      return; // already paid (a duplicate answer)
  }

  if (session.amountTotal !== order.total) {
    log.error("checkout: paid amount differs from the order total", undefined, {
      order: order.number,
      paid: session.amountTotal,
      total: order.total,
    });
  }
  await markOrderPaid(tx, order.id);
  await createPayment(tx, {
    order_id: order.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.paymentIntentId || null,
    amount: session.amountTotal,
    currency: session.currency,
  });
  await removeOrderedCartLines(tx, {
    user_id: order.user_id,
    order_id: order.id,
  });
  // The code is spent; until now a cancelled payment page kept it in the bag.
  if (order.coupon_code !== null) {
    await clearPaidCartCoupon(tx, {
      user_id: order.user_id,
      coupon_code: order.coupon_code,
    });
  }
  await enqueue(tx, "order_confirmed", order.id);
  log.info("checkout: order paid", { order: order.number });
}
