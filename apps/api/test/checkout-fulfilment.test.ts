import { beforeEach, describe, expect, it } from "vitest";
import {
  canApply,
  Refusal,
  transitionRefusal,
  type Action,
} from "../src/checkout/service";
import type { User } from "../src/db/gen";
import { RefusedError } from "../src/services/payments";
import { placeOrder, setupCheckoutApp, stockOf } from "./checkout-helpers";
import { makeUser } from "./helpers";

const ctx = setupCheckoutApp();
const { db, payments, service } = ctx;

let user: User;
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  user = await makeUser(db);
});

/** The Refusal fn rejects with, as { status, code, message }. */
async function refusal(fn: () => Promise<unknown>) {
  const err = await fn().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Refusal);
  const r = err as Refusal;
  return { status: r.status, code: r.code, message: r.message };
}

const outbox = async () =>
  (
    await db.query("SELECT kind FROM email_outbox ORDER BY created_at")
  ).rows.map((r) => r.kind);

describe("canApply", () => {
  const statuses = [
    "pending",
    "paid",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ];
  const allowed: Record<Action, string[]> = {
    ship: ["paid"],
    deliver: ["shipped"],
    cancel: ["pending"],
    refund: ["paid", "shipped", "delivered"],
  };
  it("follows the transition table", () => {
    for (const [action, ok] of Object.entries(allowed)) {
      for (const status of statuses)
        expect(canApply(action, status), `${action} ${status}`).toBe(
          ok.includes(status),
        );
    }
    expect(canApply("archive", "paid")).toBe(false);
    expect(canApply("constructor", "paid")).toBe(false);
  });

  it("explains a refused move", () => {
    expect(transitionRefusal("cancel", "shipped").message).toBe(
      "This order is shipped, so it can't be cancelled",
    );
  });
});

describe("ship and deliver", () => {
  it("ships a paid order with its tracking number and queues the email", async () => {
    const order = await placeOrder(ctx, user.id);
    const shipped = await service.ship(order.number, "TRACK-1");
    expect(shipped).toMatchObject({
      status: "shipped",
      tracking_number: "TRACK-1",
    });
    expect(shipped.shipped_at).toBeInstanceOf(Date);
    expect(await outbox()).toEqual(["order_confirmed", "order_shipped"]);

    const delivered = await service.deliver(order.number);
    expect(delivered.status).toBe("delivered");
    expect(delivered.delivered_at).toBeInstanceOf(Date);
  });

  it("ships without a tracking number", async () => {
    const order = await placeOrder(ctx, user.id);
    expect((await service.ship(order.number, "")).tracking_number).toBeNull();
  });

  it("refuses moves the status doesn't allow, and unknown orders", async () => {
    const order = await placeOrder(ctx, user.id);
    expect(await refusal(() => service.deliver(order.number))).toEqual({
      status: 409,
      code: "INVALID_ORDER_TRANSITION",
      message: "This order is paid, so it can't be delivered",
    });
    expect(await refusal(() => service.ship(999999, ""))).toEqual({
      status: 404,
      code: "ORDER_NOT_FOUND",
      message: "Order not found",
    });
  });
});

describe("cancelPending", () => {
  it("expires the Stripe page, cancels the order and returns its stock", async () => {
    const order = await placeOrder(ctx, user.id, {
      paid: false,
      quantity: 2,
      stock: 5,
    });
    expect(await stockOf(db, order.variant.id)).toBe(3);
    const cancelled = await service.cancelPending(order.number);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).toBeInstanceOf(Date);
    expect(payments.expired).toEqual([order.sessionId]);
    expect(await stockOf(db, order.variant.id)).toBe(5);
  });

  it("refuses a paid order", async () => {
    const order = await placeOrder(ctx, user.id);
    expect(
      await refusal(() => service.cancelPending(order.number)),
    ).toMatchObject({
      status: 409,
      message: "This order is paid, so it can't be cancelled",
    });
  });

  it("settles an order Stripe says was paid, and refuses", async () => {
    const order = await placeOrder(ctx, user.id, { paid: false });
    payments.pay(order.sessionId);
    payments.expireError = new Error("session is complete");
    expect(await refusal(() => service.cancelPending(order.number))).toEqual({
      status: 409,
      code: "ORDER_ALREADY_PAID",
      message:
        "This order has just been paid, so it can't be cancelled. Refund it instead.",
    });
    const { rows } = await db.query(
      "SELECT status FROM orders WHERE number = $1",
      [order.number],
    );
    expect(rows[0].status).toBe("paid");
  });

  it("waits while a delayed payment settles", async () => {
    const order = await placeOrder(ctx, user.id, { paid: false });
    payments.expireError = new Error("session is complete");
    expect(await refusal(() => service.cancelPending(order.number))).toEqual({
      status: 409,
      code: "INVALID_ORDER_TRANSITION",
      message:
        "Stripe is still processing this order's payment. Try again once it settles.",
    });
  });

  it("cancels a page that had already expired", async () => {
    const order = await placeOrder(ctx, user.id, { paid: false });
    payments.sessions.get(order.sessionId)!.expired = true;
    payments.expireError = new Error("session is expired");
    expect((await service.cancelPending(order.number)).status).toBe(
      "cancelled",
    );
  });

  it("answers 502 when Stripe can't be asked", async () => {
    const order = await placeOrder(ctx, user.id, { paid: false });
    payments.expireError = new Error("connection refused");
    payments.failGet = true;
    expect(await refusal(() => service.cancelPending(order.number))).toEqual({
      status: 502,
      code: "PAYMENT_PROVIDER_ERROR",
      message: "Stripe didn't answer, so nothing was changed. Try again.",
    });
  });

  it("waits for a checkout that is still opening its page", async () => {
    const order = await placeOrder(ctx, user.id, { paid: false });
    await db.query("UPDATE orders SET stripe_session_id = NULL WHERE id = $1", [
      order.id,
    ]);
    expect(await refusal(() => service.cancelPending(order.number))).toEqual({
      status: 409,
      code: "INVALID_ORDER_TRANSITION",
      message: "This checkout is still opening. Try again in a minute.",
    });
    service.now = () => new Date(Date.now() + 32 * 60_000);
    expect((await service.cancelPending(order.number)).status).toBe(
      "cancelled",
    );
  });
});

describe("refundPaid", () => {
  it("refunds through Stripe keyed by the order, without restock", async () => {
    const order = await placeOrder(ctx, user.id, { quantity: 2, stock: 5 });
    const refunded = await service.refundPaid(order.number, false);
    expect(refunded.status).toBe("refunded");
    expect(refunded.refunded_at).toBeInstanceOf(Date);
    expect(payments.refunds).toEqual([
      { paymentIntentId: "pi_" + order.sessionId, key: "refund-" + order.id },
    ]);
    const { rows } = await db.query(
      "SELECT stripe_refund_id, refunded_at FROM payments",
    );
    expect(rows[0].stripe_refund_id).toBe("re_refund-" + order.id);
    expect(rows[0].refunded_at).toBeInstanceOf(Date);
    expect(await stockOf(db, order.variant.id)).toBe(3);
    expect(await outbox()).toEqual(["order_confirmed", "order_refunded"]);
  });

  it("returns the stock with restock, minus what the order was short", async () => {
    const order = await placeOrder(ctx, user.id, { quantity: 2, stock: 5 });
    await db.query(
      "UPDATE order_items SET stock_shortfall = 1 WHERE order_id = $1",
      [order.id],
    );
    await service.refundPaid(order.number, true);
    expect(await stockOf(db, order.variant.id)).toBe(4);
  });

  it("refunds a delivered order", async () => {
    const order = await placeOrder(ctx, user.id);
    await service.ship(order.number, "");
    await service.deliver(order.number);
    expect((await service.refundPaid(order.number, false)).status).toBe(
      "refunded",
    );
  });

  it("refuses an unpaid or already refunded order", async () => {
    const pending = await placeOrder(ctx, user.id, { paid: false });
    expect(
      await refusal(() => service.refundPaid(pending.number, false)),
    ).toMatchObject({
      status: 409,
      message: "This order is pending, so it can't be refunded",
    });
    const order = await placeOrder(ctx, user.id);
    await service.refundPaid(order.number, false);
    expect(
      await refusal(() => service.refundPaid(order.number, false)),
    ).toMatchObject({
      message: "This order is refunded, so it can't be refunded",
    });
  });

  it("refuses without a recorded payment intent", async () => {
    const order = await placeOrder(ctx, user.id);
    await db.query("UPDATE payments SET stripe_payment_intent_id = NULL");
    expect(
      await refusal(() => service.refundPaid(order.number, false)),
    ).toEqual({
      status: 409,
      code: "INVALID_ORDER_TRANSITION",
      message:
        "No payment is recorded for this order, so there is nothing to refund",
    });
  });

  it("passes on Stripe's refusal and changes nothing", async () => {
    const order = await placeOrder(ctx, user.id);
    payments.refundError = new RefusedError("Charge ch_1 has been disputed.");
    expect(await refusal(() => service.refundPaid(order.number, true))).toEqual(
      {
        status: 409,
        code: "REFUND_REFUSED",
        message: "Stripe refused the refund: Charge ch_1 has been disputed.",
      },
    );
    const { rows } = await db.query("SELECT status FROM orders WHERE id = $1", [
      order.id,
    ]);
    expect(rows[0].status).toBe("paid");
  });

  it("answers 502 when Stripe fails", async () => {
    const order = await placeOrder(ctx, user.id);
    payments.refundError = new Error("stripe: refund: connection reset");
    expect(
      await refusal(() => service.refundPaid(order.number, false)),
    ).toMatchObject({
      status: 502,
      code: "PAYMENT_PROVIDER_ERROR",
    });
  });
});
