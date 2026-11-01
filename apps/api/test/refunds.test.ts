import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allocateDiscount,
  splitRefund,
  unitsAmount,
} from "../src/checkout/refunds";
import { Refusal } from "../src/checkout/service";
import { createReferral, type User } from "../src/db/gen";
import type { Mailer, Message } from "../src/emails/mailer";
import { render } from "../src/emails/render";
import { EmailWorker } from "../src/emails/worker";
import type { PaymentEvent, RefundInfo } from "../src/services/payments";
import { emptySession } from "../src/services/payments";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
  stockOf,
} from "./checkout-helpers";
import { makeUser, signIn } from "./helpers";

// Partial refunds (src/checkout/refunds.ts): the amount math, card/credit
// split, idempotency, restock per line, and orders kept in step with
// refunds made (or failing) at Stripe.

const ctx = setupCheckoutApp();
const { db, payments, service } = ctx;

let user: User;
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  user = await makeUser(db);
});

/**
 * A paid order of two lines: 3 × 1000 (a) and 1 × 2001 (b), with
 * discount and credit set on it as given (total adjusted to match).
 */
async function twoLineOrder(
  opts: { discount?: number; credit?: number; stock?: number } = {},
) {
  const a = await makeVariant(db, { name: "Alpha", price: 1000, stock: 10 });
  const b = await makeVariant(db, { name: "Beta", price: 2001, stock: 10 });
  await addToCart(db, user.id, a.variant.id, 3);
  await addToCart(db, user.id, b.variant.id, 1);
  const { order_number } = await service.start(user.id, { address: ADDRESS });
  const { rows } = await db.query(
    "SELECT id, stripe_session_id, shipping FROM orders WHERE number = $1",
    [order_number],
  );
  const id = rows[0].id as string;
  const discount = opts.discount ?? 0;
  const credit = opts.credit ?? 0;
  if (discount || credit) {
    await db.query(
      `UPDATE orders SET discount = $2, credit = $3,
         total = subtotal - $2 + shipping - $3 WHERE id = $1`,
      [id, discount, credit],
    );
  }
  payments.pay(rows[0].stripe_session_id);
  await service.reconcile(rows[0].stripe_session_id);
  const items = (
    await db.query(
      "SELECT id, product_name, quantity FROM order_items WHERE order_id = $1",
      [id],
    )
  ).rows as { id: string; product_name: string }[];
  const item = (name: string) => items.find((i) => i.product_name === name)!.id;
  return {
    number: order_number,
    id,
    shipping: rows[0].shipping as number,
    a: { ...a, item: item("Alpha") },
    b: { ...b, item: item("Beta") },
  };
}

const orderRow = async (id: string) =>
  (await db.query("SELECT * FROM orders WHERE id = $1", [id])).rows[0];

const refundRows = async (orderId: string) =>
  (
    await db.query(
      "SELECT * FROM order_refunds WHERE order_id = $1 ORDER BY created_at",
      [orderId],
    )
  ).rows;

const refundEmails = async (orderId: string) =>
  (
    await db.query(
      "SELECT refund_id FROM email_outbox WHERE order_id = $1 AND kind = 'order_refunded'",
      [orderId],
    )
  ).rows;

async function refusal(fn: () => Promise<unknown>) {
  const err = await fn().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Refusal);
  const r = err as Refusal;
  return { status: r.status, code: r.code, message: r.message };
}

const refundEvent = (refund: Partial<RefundInfo> & { id: string }) =>
  ({
    id: `evt_${randomUUID()}`,
    type: "refund.updated",
    kind: "refund",
    session: emptySession(),
    refund: {
      paymentIntentId: "",
      amount: 0,
      currency: "eur",
      status: "succeeded",
      failureReason: "",
      ...refund,
    },
  }) satisfies PaymentEvent;

const intentOf = async (orderId: string) =>
  (
    await db.query(
      "SELECT stripe_payment_intent_id FROM payments WHERE order_id = $1",
      [orderId],
    )
  ).rows[0].stripe_payment_intent_id as string;

describe("refund math", () => {
  it("shares a discount out over the lines, exactly", () => {
    const lines = [
      { id: "a", line_total: 3000 },
      { id: "b", line_total: 2001 },
      { id: "c", line_total: 1 },
    ];
    const got = allocateDiscount(lines, 1000);
    expect([...got.values()].reduce((s, v) => s + v, 0)).toBe(1000);
    // 1000·3000/5002 = 599.76, 1000·2001/5002 = 400.04, 1000/5002 = 0.2
    expect(Object.fromEntries(got)).toEqual({ a: 600, b: 400, c: 0 });
    expect(Object.fromEntries(allocateDiscount(lines, 0))).toEqual({
      a: 0,
      b: 0,
      c: 0,
    });
    // A 100% discount: every line is worth nothing.
    expect(Object.fromEntries(allocateDiscount(lines, 9999))).toEqual({
      a: 3000,
      b: 2001,
      c: 1,
    });
  });

  it("prices units so any sequence of partial refunds adds up to the line", () => {
    // A line of 3 worth 1000: 333, 333, 334 whichever way it is split.
    expect(unitsAmount(1000, 3, 0, 1)).toBe(333);
    expect(unitsAmount(1000, 3, 1, 1)).toBe(333);
    expect(unitsAmount(1000, 3, 2, 1)).toBe(334);
    expect(unitsAmount(1000, 3, 0, 2) + unitsAmount(1000, 3, 2, 1)).toBe(1000);
    expect(unitsAmount(1000, 3, 0, 3)).toBe(1000);
  });

  it("splits card and credit by their shares, reconciling on the last refund", () => {
    const paid = { paidCard: 3001, paidCredit: 1000 };
    const first = splitRefund({
      ...paid,
      refundedCard: 0,
      refundedCredit: 0,
      amount: 1001,
    });
    // credit: floor(1000 · 1001 / 4001) = 250
    expect(first).toEqual({ card: 751, credit: 250 });
    const second = splitRefund({
      ...paid,
      refundedCard: 751,
      refundedCredit: 250,
      amount: 4001 - 1001,
    });
    expect(second).toEqual({ card: 3001 - 751, credit: 750 });
    // After a card-only refund in the Dashboard, the rest leans on credit.
    expect(
      splitRefund({
        ...paid,
        refundedCard: 3001,
        refundedCredit: 0,
        amount: 500,
      }),
    ).toEqual({ card: 0, credit: 500 });
    // Credit only, or nothing paid at all.
    expect(
      splitRefund({
        paidCard: 0,
        paidCredit: 0,
        refundedCard: 0,
        refundedCredit: 0,
        amount: 0,
      }),
    ).toEqual({ card: 0, credit: 0 });
  });
});

describe("partial refunds", () => {
  it("refunds chosen units at what was paid for them, after the discount", async () => {
    const order = await twoLineOrder({ discount: 1000 });
    // a: 3000 − 600 = 2400 for 3 units → 800 for the first.
    const after = await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.a.item, quantity: 1 }],
        note: "Damaged",
      },
      null,
    );
    expect(after).toMatchObject({
      status: "partially_refunded",
      refunded_total: 800,
      refunded_credit: 0,
    });
    expect(payments.refunds.map((r) => r.amount)).toEqual([800]);
    const [row] = await refundRows(order.id);
    expect(row).toMatchObject({
      status: "succeeded",
      amount_card: 800,
      amount_credit: 0,
      amount_items: 800,
      shipping: false,
      note: "Damaged",
      source: "admin",
    });
    expect(await refundEmails(order.id)).toEqual([{ refund_id: row.id }]);
  });

  it("goes partial → partial → refunded, with the totals adding up", async () => {
    const order = await twoLineOrder({ discount: 1000 });
    const o = await orderRow(order.id);
    const paid = o.total + o.credit;
    const step = (body: object) =>
      service.refund(
        order.number,
        { request_id: randomUUID(), restock: false, ...body },
        null,
      );
    expect(
      (await step({ items: [{ item_id: order.a.item, quantity: 2 }] })).status,
    ).toBe("partially_refunded");
    expect((await step({ shipping: true, extra: 0 })).status).toBe(
      "partially_refunded",
    );
    // Shipping goes back once.
    expect(await refusal(() => step({ shipping: true }))).toMatchObject({
      status: 409,
      code: "INVALID_REFUND",
    });
    // More units than are left.
    expect(
      await refusal(() =>
        step({ items: [{ item_id: order.a.item, quantity: 2 }] }),
      ),
    ).toMatchObject({
      status: 409,
      message: "Only 1 of Alpha can still be refunded",
    });
    const last = await step({
      items: [
        { item_id: order.a.item, quantity: 1 },
        { item_id: order.b.item, quantity: 1 },
      ],
    });
    expect(last).toMatchObject({ status: "refunded", refunded_total: paid });
    expect(payments.refunds.reduce((s, r) => s + r.amount, 0)).toBe(o.total);
    expect(await refundEmails(order.id)).toHaveLength(3);
    // Nothing left.
    expect(
      await refusal(() => service.refundPaid(order.number, false)),
    ).toMatchObject({
      status: 409,
      message: "This order is refunded, so it can't be refunded",
    });
  });

  it("refuses a goodwill extra past what is left", async () => {
    const order = await twoLineOrder();
    const o = await orderRow(order.id);
    expect(
      await refusal(() =>
        service.refund(
          order.number,
          { request_id: randomUUID(), restock: false, extra: o.total + 1 },
          null,
        ),
      ),
    ).toMatchObject({ status: 409, code: "REFUND_TOO_LARGE" });
    const goodwill = await service.refund(
      order.number,
      { request_id: randomUUID(), restock: false, extra: 250, note: "Late" },
      null,
    );
    expect(goodwill).toMatchObject({
      status: "partially_refunded",
      refunded_total: 250,
    });
    // The rest: what's left after the goodwill, not the lines' full worth.
    const rest = await service.refundPaid(order.number, false);
    expect(rest).toMatchObject({ status: "refunded", refunded_total: o.total });
    expect(payments.refunds.map((r) => r.amount)).toEqual([250, o.total - 250]);
  });

  it("splits between card and store credit, reconciling exactly", async () => {
    const order = await twoLineOrder({ credit: 1000 });
    const o = await orderRow(order.id);
    const paid = o.total + o.credit;
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.b.item, quantity: 1 }],
      },
      null,
    );
    const credit1 = Math.floor((1000 * 2001) / paid);
    let [row] = await refundRows(order.id);
    expect(row).toMatchObject({
      amount_card: 2001 - credit1,
      amount_credit: credit1,
    });
    expect(payments.refunds[0]!.amount).toBe(2001 - credit1);
    const ledger = async () =>
      (
        await db.query(
          "SELECT amount, kind, refund_id FROM credit_ledger WHERE order_id = $1 AND kind <> 'spent' ORDER BY created_at",
          [order.id],
        )
      ).rows;
    expect(await ledger()).toEqual([
      { amount: credit1, kind: "reversed", refund_id: row.id },
    ]);

    const done = await service.refundPaid(order.number, true);
    expect(done).toMatchObject({
      status: "refunded",
      refunded_total: paid,
      refunded_credit: 1000,
    });
    expect(payments.refunds.reduce((s, r) => s + r.amount, 0)).toBe(o.total);
    const rows = await refundRows(order.id);
    expect(rows.reduce((s, r) => s + r.amount_credit, 0)).toBe(1000);
    [, row] = rows;
    expect((await ledger())[1]).toEqual({
      amount: 1000 - credit1,
      kind: "reversed",
      refund_id: row.id,
    });
  });

  it("refunds a 100% discount (or credit-only) order without calling Stripe", async () => {
    const order = await twoLineOrder();
    await db.query(
      "UPDATE orders SET discount = subtotal, shipping = 0, total = 0 WHERE id = $1",
      [order.id],
    );
    await db.query(
      "UPDATE payments SET stripe_payment_intent_id = NULL WHERE order_id = $1",
      [order.id],
    );
    const before = await stockOf(db, order.a.variant.id);
    const partly = await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: true,
        items: [{ item_id: order.a.item, quantity: 3 }],
      },
      null,
    );
    expect(partly.status).toBe("partially_refunded");
    expect(await stockOf(db, order.a.variant.id)).toBe(before + 3);
    expect((await service.refundPaid(order.number, false)).status).toBe(
      "refunded",
    );
    expect(payments.refunds).toEqual([]);
  });

  it("restocks per line", async () => {
    const order = await twoLineOrder();
    const [a0, b0] = [
      await stockOf(db, order.a.variant.id),
      await stockOf(db, order.b.variant.id),
    ];
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [
          { item_id: order.a.item, quantity: 2, restock: true },
          { item_id: order.b.item, quantity: 1 },
        ],
      },
      null,
    );
    expect(await stockOf(db, order.a.variant.id)).toBe(a0 + 2);
    expect(await stockOf(db, order.b.variant.id)).toBe(b0);
    const lines = (
      await db.query(
        "SELECT order_item_id, quantity, restocked FROM order_refund_items",
      )
    ).rows;
    expect(lines).toContainEqual({
      order_item_id: order.a.item,
      quantity: 2,
      restocked: 2,
    });
    expect(lines).toContainEqual({
      order_item_id: order.b.item,
      quantity: 1,
      restocked: 0,
    });
  });

  it("restocks no more than the order took (a shortfall)", async () => {
    const order = await twoLineOrder();
    await db.query("UPDATE order_items SET stock_shortfall = 2 WHERE id = $1", [
      order.a.item,
    ]);
    const a0 = await stockOf(db, order.a.variant.id);
    for (let i = 0; i < 3; i++)
      await service.refund(
        order.number,
        {
          request_id: randomUUID(),
          restock: true,
          items: [{ item_id: order.a.item, quantity: 1 }],
        },
        null,
      );
    expect(await stockOf(db, order.a.variant.id)).toBe(a0 + 1);
  });

  it("keeps a partly refunded order shippable, keeping its status", async () => {
    const order = await twoLineOrder();
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: true,
        items: [{ item_id: order.b.item, quantity: 1 }],
      },
      null,
    );
    const shipped = await service.ship(order.number, "T1");
    expect(shipped.status).toBe("partially_refunded");
    expect(shipped.shipped_at).toBeInstanceOf(Date);
    expect(await refusal(() => service.ship(order.number, "T2"))).toMatchObject(
      { status: 409 },
    );
    const delivered = await service.deliver(order.number);
    expect(delivered.delivered_at).toBeInstanceOf(Date);
    expect(delivered.status).toBe("partially_refunded");
  });
});

describe("idempotency", () => {
  it("refunds once per request id, double click or retry", async () => {
    const order = await twoLineOrder();
    const body = {
      request_id: randomUUID(),
      restock: false,
      items: [{ item_id: order.a.item, quantity: 1 }],
    };
    const [x, y] = await Promise.all([
      service.refund(order.number, body, null),
      service.refund(order.number, body, null),
    ]);
    expect(x.refunded_total).toBe(1000);
    expect(y.refunded_total).toBe(1000);
    await service.refund(order.number, body, null);
    expect(payments.refunds).toHaveLength(1);
    expect(await refundRows(order.id)).toHaveLength(1);
    expect((await orderRow(order.id)).refunded_total).toBe(1000);

    const other = await twoLineOrder();
    expect(
      await refusal(() => service.refund(other.number, body, null)),
    ).toMatchObject({ status: 409, code: "REFUND_REQUEST_REUSED" });
  });

  it("records a refund Stripe made before a timeout when the request is retried", async () => {
    const order = await twoLineOrder();
    const body = {
      request_id: randomUUID(),
      restock: false,
      items: [{ item_id: order.a.item, quantity: 1 }],
    };
    payments.failAfterRefund = true;
    expect(
      await refusal(() => service.refund(order.number, body, null)),
    ).toMatchObject({ status: 502, code: "PAYMENT_PROVIDER_ERROR" });
    expect(await refundRows(order.id)).toHaveLength(0);
    payments.failAfterRefund = false;
    await service.refund(order.number, body, null);
    // Same key both times: Stripe made one refund.
    expect(new Set(payments.refunds.map((r) => r.key)).size).toBe(1);
    expect(payments.stripeRefunds.size).toBe(1);
    expect(await refundRows(order.id)).toHaveLength(1);
  });

  it("takes over the webhook's record of a refund whose request timed out", async () => {
    const order = await twoLineOrder({ credit: 500 });
    const body = {
      request_id: randomUUID(),
      restock: true,
      items: [{ item_id: order.a.item, quantity: 1 }],
    };
    payments.failAfterRefund = true;
    await refusal(() => service.refund(order.number, body, null));
    const [made] = payments.stripeRefunds.values();
    // Stripe's webhook arrives first: a card refund made outside the admin.
    await service.handleEvent(refundEvent({ ...made! }));
    let rows = await refundRows(order.id);
    expect(rows).toMatchObject([
      { source: "stripe", amount_card: made!.amount },
    ]);
    // The admin retries: the same refund, now with its lines and credit.
    payments.failAfterRefund = false;
    const after = await service.refund(order.number, body, null);
    rows = await refundRows(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "admin",
      request_id: body.request_id,
      amount_card: made!.amount,
    });
    expect(rows[0].amount_credit).toBeGreaterThan(0);
    expect(after.refunded_total).toBe(made!.amount + rows[0].amount_credit);
  });
});

describe("Stripe webhooks", () => {
  it("records a Dashboard refund once, and not the admin's own twice", async () => {
    const order = await twoLineOrder();
    const pi = await intentOf(order.id);
    // The admin's refund, then Stripe's events about it.
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.a.item, quantity: 1 }],
      },
      null,
    );
    const [own] = payments.stripeRefunds.values();
    await service.handleEvent(refundEvent({ ...own! }));
    expect(await refundRows(order.id)).toHaveLength(1);

    // A refund made in the Dashboard, its event delivered twice.
    const event = refundEvent({
      id: "re_dash",
      paymentIntentId: pi,
      amount: 700,
    });
    await service.handleEvent(event);
    await service.handleEvent(event);
    await service.handleEvent({ ...event, id: `evt_${randomUUID()}` });
    const rows = await refundRows(order.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      stripe_refund_id: "re_dash",
      source: "stripe",
      amount_card: 700,
      amount_extra: 700,
    });
    expect(await orderRow(order.id)).toMatchObject({
      status: "partially_refunded",
      refunded_total: 1700,
    });
    // What's left is refunded in full, Dashboard refund counted.
    const o = await orderRow(order.id);
    await service.refundPaid(order.number, false);
    expect(payments.refunds.at(-1)!.amount).toBe(o.total - 1700);
  });

  it("syncs charge.refunded by listing the payment's refunds", async () => {
    const order = await twoLineOrder();
    const pi = await intentOf(order.id);
    const o = await orderRow(order.id);
    payments.stripeRefunds.set("re_full", {
      id: "re_full",
      paymentIntentId: pi,
      amount: o.total,
      currency: "eur",
      status: "succeeded",
      failureReason: "",
    });
    await service.handleEvent({
      id: `evt_${randomUUID()}`,
      type: "charge.refunded",
      kind: "charge_refunded",
      session: emptySession(),
      paymentIntentId: pi,
    });
    expect(await orderRow(order.id)).toMatchObject({
      status: "refunded",
      refunded_total: o.total,
    });
  });

  it("puts a failed refund's money and lines back", async () => {
    const order = await twoLineOrder({ credit: 600 });
    payments.refundStatus = "pending";
    const after = await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.b.item, quantity: 1 }],
      },
      null,
    );
    // Pending money counts as gone back, so it can't be refunded twice.
    expect(after.status).toBe("partially_refunded");
    const [row] = await refundRows(order.id);
    expect(row.status).toBe("pending");
    expect(row.amount_credit).toBeGreaterThan(0);

    const [made] = payments.stripeRefunds.values();
    await service.handleEvent(
      refundEvent({
        ...made!,
        status: "failed",
        failureReason: "expired_or_canceled_card",
      }),
    );
    const [failed] = await refundRows(order.id);
    expect(failed).toMatchObject({
      status: "failed",
      failure_reason: "expired_or_canceled_card",
    });
    expect(await orderRow(order.id)).toMatchObject({
      status: "paid",
      refunded_total: 0,
      refunded_credit: 0,
    });
    // The credit it gave is taken back.
    const { rows: ledger } = await db.query(
      "SELECT amount, kind FROM credit_ledger WHERE refund_id = $1 ORDER BY created_at",
      [row.id],
    );
    expect(ledger).toEqual([
      { amount: row.amount_credit, kind: "reversed" },
      { amount: -row.amount_credit, kind: "adjusted" },
    ]);
    // The line can be refunded again.
    payments.refundStatus = "succeeded";
    expect(
      (
        await service.refund(
          order.number,
          {
            request_id: randomUUID(),
            restock: false,
            items: [{ item_id: order.b.item, quantity: 1 }],
          },
          null,
        )
      ).status,
    ).toBe("partially_refunded");
  });

  it("refunds in full again after a full refund failed (a new Stripe key)", async () => {
    const order = await twoLineOrder();
    payments.refundStatus = "pending";
    await service.refundPaid(order.number, false);
    const [made] = payments.stripeRefunds.values();
    await service.handleEvent(refundEvent({ ...made!, status: "failed" }));
    expect((await orderRow(order.id)).status).toBe("paid");
    payments.refundStatus = "succeeded";
    expect((await service.refundPaid(order.number, false)).status).toBe(
      "refunded",
    );
    expect(payments.refunds.map((r) => r.key)).toEqual([
      `refund-${order.id}-0`,
      `refund-${order.id}-1`,
    ]);
  });

  it("refuses a refund Stripe fails at once, recording nothing", async () => {
    const order = await twoLineOrder();
    payments.refundStatus = "failed";
    expect(
      await refusal(() => service.refundPaid(order.number, false)),
    ).toMatchObject({ status: 409, code: "REFUND_REFUSED" });
    expect(await refundRows(order.id)).toHaveLength(0);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("records a dispute and holds the referral back", async () => {
    const order = await twoLineOrder();
    const pi = await intentOf(order.id);
    await service.handleEvent({
      id: `evt_${randomUUID()}`,
      type: "charge.dispute.created",
      kind: "dispute",
      session: emptySession(),
      dispute: {
        id: "dp_1",
        paymentIntentId: pi,
        status: "needs_response",
        amount: 100,
        reason: "fraudulent",
      },
    });
    const o = await orderRow(order.id);
    expect(o.dispute_status).toBe("needs_response");
    expect(o.disputed_at).toBeInstanceOf(Date);
  });
});

describe("referrals", () => {
  async function referred(order: { id: string }, friendMin: number | null) {
    const referrer = await makeUser(db);
    await createReferral(db, {
      referrer_id: referrer.id,
      order_id: order.id,
      friend_email: `${randomUUID()}@example.org`,
      friend_kind: "amount",
      friend_value: 500,
      friend_min: friendMin,
      reward: 500,
      pay_after_days: 0,
      custom_prints: false,
      discount: 0,
    });
  }
  const status = async (orderId: string) =>
    (
      await db.query("SELECT status FROM referrals WHERE order_id = $1", [
        orderId,
      ])
    ).rows[0].status;

  it("keeps the referral after a partial refund that stays above its minimum", async () => {
    const order = await twoLineOrder();
    await referred(order, 3000);
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.b.item, quantity: 1 }],
      },
      null,
    );
    expect(await status(order.id)).toBe("pending"); // 3000 kept
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.a.item, quantity: 1 }],
      },
      null,
    );
    expect(await status(order.id)).toBe("cancelled"); // 2000 < 3000
  });

  it("cancels the referral once the order is refunded in full", async () => {
    const order = await twoLineOrder();
    await referred(order, null);
    await service.refund(
      order.number,
      { request_id: randomUUID(), restock: false, extra: 100 },
      null,
    );
    expect(await status(order.id)).toBe("pending");
    await service.refundPaid(order.number, false);
    expect(await status(order.id)).toBe("cancelled");
  });
});

describe("POST /admin/orders/:number/refund", () => {
  it("refunds part of an order and lists its refunds", async () => {
    const order = await twoLineOrder();
    const { cookie, user: admin } = await signIn(db, ctx.cfg, "admin");
    const post = (body: object) =>
      request(ctx.app)
        .post(`/api/v1/admin/orders/${order.number}/refund`)
        .set("Cookie", cookie)
        .send(body);
    // A partial refund needs a request id.
    const bad = await post({ restock: false, shipping: true });
    expect(bad.status).toBe(400);
    const res = await post({
      request_id: randomUUID(),
      restock: true,
      items: [{ item_id: order.a.item, quantity: 2 }],
      note: "Wrong size",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "partially_refunded",
      refunded_total: 2000,
      refunds: [
        {
          status: "succeeded",
          amount_card: 2000,
          amount_credit: 0,
          note: "Wrong size",
          source: "admin",
          created_by: { id: admin.id },
          lines: [
            {
              order_item_id: order.a.item,
              quantity: 2,
              amount: 2000,
              restocked: 2,
            },
          ],
        },
      ],
    });
    const list = await request(ctx.app)
      .get("/api/v1/admin/orders?status=partially_refunded")
      .set("Cookie", cookie);
    expect(list.body.data.map((o: { number: number }) => o.number)).toContain(
      order.number,
    );
  });
});

describe("refund email", () => {
  it("sends one email per refund, partial then full", async () => {
    const order = await twoLineOrder();
    await db.query("UPDATE email_outbox SET status = 'sent'");
    await service.refund(
      order.number,
      {
        request_id: randomUUID(),
        restock: false,
        items: [{ item_id: order.a.item, quantity: 1 }],
      },
      null,
    );
    await service.refundPaid(order.number, false);
    const sent: Message[] = [];
    const mailer: Mailer = { send: async (m) => void sent.push(m) };
    await new EmailWorker(db, mailer, "https://s").sendDue();
    const label = `OHB-${order.number}`;
    expect(sent.map((m) => m.subject).sort()).toEqual([
      `A refund for your order ${label}`,
      `Your order ${label} has been refunded`,
    ]);
    const partial = sent.find((m) => m.subject.startsWith("A refund"))!;
    expect(partial.text).toContain("1 × Alpha  €10.00");
  });

  const order = {
    number: 1042,
    subtotal: 5000,
    discount: 0,
    coupon_code: null,
    credit: 0,
    shipping: 0,
    total: 5000,
    currency: "eur",
    shipping_address: null,
    tracking_number: null,
    created_at: null,
  };
  const item = {
    product_name: "Tee",
    options: [],
    quantity: 2,
    line_total: 5000,
    image: "",
  };

  it("words a partial refund with its items and split", () => {
    const r = render("order_refunded", order, "Ada", [item], "https://s", {
      refund: {
        amount_card: 1500,
        amount_credit: 1000,
        amount_shipping: 0,
        lines: [{ item, quantity: 1, amount: 2500 }],
        full: false,
      },
    });
    expect(r.subject).toBe("A refund for your order OHB-1042");
    expect(r.text).toContain(
      "We've refunded €25.00 of your order (€15.00 to your original payment method and €10.00 as store credit).",
    );
    expect(r.text).toContain("1 × Tee  €25.00");
    expect(r.text).toContain("Total refunded  €25.00");
    expect(r.html).toContain("Total refunded");
  });

  it("words the last refund as the order's full refund", () => {
    const r = render("order_refunded", order, "Ada", [item], "https://s", {
      refund: {
        amount_card: 5000,
        amount_credit: 0,
        amount_shipping: 0,
        lines: [{ item, quantity: 2, amount: 5000 }],
        full: true,
      },
    });
    expect(r.subject).toBe("Your order OHB-1042 has been refunded");
    expect(r.text).toContain("We've refunded the rest of your order, €50.00");
  });
});
