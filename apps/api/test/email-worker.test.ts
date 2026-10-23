import { describe, expect, it } from "vitest";
import {
  claimDueEmailsSql,
  createOrder,
  createOrderItem,
  getEmailOrderSql,
  type EmailOutbox,
  type Order,
} from "../src/db/gen";
import type { Queryable } from "../src/db/queryable";
import { enqueue, type EmailKind } from "../src/emails/outbox";
import {
  PermanentError,
  type Mailer,
  type Message,
} from "../src/emails/mailer";
import { EmailWorker, MAX_ATTEMPTS } from "../src/emails/worker";
import { makeUser, setupTestApp } from "./helpers";

// The port of TestWorker (internal/emails/emails_test.go), against the real
// outbox with a fake mailer.

const { db, cfg } = setupTestApp();

/** Records what it sent; fails with err when set. */
class FakeMailer implements Mailer {
  sent: Message[] = [];
  constructor(
    private err: unknown = null,
    private onSend?: () => void,
  ) {}
  async send(m: Message) {
    this.onSend?.();
    if (this.err) throw this.err;
    this.sent.push(m);
  }
}

async function placeOrder(): Promise<Order> {
  const user = await makeUser(db, { name: "Ada Lovelace" });
  const order = await createOrder(db, {
    user_id: user.id,
    subtotal: 2900,
    shipping: 800,
    total: 3700,
    currency: "usd",
    email: "ada@example.com",
    shipping_address: JSON.stringify({
      full_name: "Ada Lovelace",
      phone: "5550100",
      line1: "1 Loom Lane",
      line2: "",
      city: "London",
      region: "",
      postal_code: "N1 9GU",
      country: "GB",
    }),
    expires_at: new Date(Date.now() + 30 * 60_000),
  });
  await createOrderItem(db, {
    order_id: order!.id,
    variant_id: null,
    product_id: null,
    product_name: "Classic tee",
    product_slug: "classic-tee",
    sku: null,
    options: JSON.stringify([{ name: "size", value: "M" }]),
    image: "",
    unit_price: 2900,
    quantity: 1,
    line_total: 2900,
  });
  return order!;
}

/** One queued email, its row adjusted by `set` (SQL assignments). */
async function queued(set = "", kind: EmailKind = "order_confirmed") {
  const order = await placeOrder();
  await enqueue(db, kind, order.id);
  if (set) await db.query(`UPDATE email_outbox SET ${set}`);
  return order;
}

interface Row extends EmailOutbox {
  due_in: number; // seconds from now until next_attempt_at
}

async function outbox(): Promise<Row> {
  const { rows } = await db.query<Row>(
    "SELECT *, extract(epoch FROM next_attempt_at - now())::float8 AS due_in FROM email_outbox",
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** The database, with a failing query or tampered claimed rows. */
function tampered(opts: {
  fail?: string;
  claimed?: (r: EmailOutbox) => EmailOutbox;
}): Queryable {
  const query = async (q: string | { text: string }, values?: unknown[]) => {
    const text = typeof q === "string" ? q : q.text;
    if (text === opts.fail) throw new Error("conn reset");
    const res = await db.query(q as string, values);
    if (text === claimDueEmailsSql && opts.claimed)
      res.rows = res.rows.map(opts.claimed);
    return res;
  };
  return { query } as Queryable;
}

const worker = (mailer: Mailer, q: Queryable = db) =>
  new EmailWorker(q, mailer, cfg.frontendUrl);

describe("EmailWorker.sendDue", () => {
  it("sends and records it", async () => {
    const order = await queued();
    const mailer = new FakeMailer();
    expect(await worker(mailer).sendDue()).toBe(1);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "ada@example.com",
      subject: `Your order OHB-${order.number} is confirmed`,
    });
    expect(mailer.sent[0]!.text).toContain("Hi Ada,");
    expect(mailer.sent[0]!.text).toContain("1 × Classic tee (M)  $29.00");
    const row = await outbox();
    expect(row).toMatchObject({
      status: "sent",
      attempts: 1,
      last_error: null,
    });
    expect(row.sent_at).toBeInstanceOf(Date);
  });

  it("retries with backoff", async () => {
    await queued("attempts = 2");
    expect(
      await worker(
        new FakeMailer(new Error("dial: connection refused")),
      ).sendDue(),
    ).toBe(1);
    const row = await outbox();
    expect(row).toMatchObject({
      status: "pending",
      attempts: 3,
      last_error: "dial: connection refused",
    });
    expect(row.due_in).toBeGreaterThan(4 * 60 - 5);
    expect(row.due_in).toBeLessThanOrEqual(4 * 60);
  });

  it("fails at once when refused for good", async () => {
    await queued();
    await worker(
      new FakeMailer(new PermanentError("550 no such user")),
    ).sendDue();
    expect(await outbox()).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "550 no such user",
    });
  });

  it("gives up when out of attempts", async () => {
    await queued(`attempts = ${MAX_ATTEMPTS - 1}`);
    await worker(new FakeMailer(new Error("timeout"))).sendDue();
    expect(await outbox()).toMatchObject({
      status: "failed",
      attempts: MAX_ATTEMPTS,
      last_error: "timeout",
    });
  });

  it("drops an email too old to send", async () => {
    await queued("created_at = now() - interval '48 hours 1 minute'");
    const mailer = new FakeMailer();
    expect(await worker(mailer).sendDue()).toBe(1);
    expect(mailer.sent).toHaveLength(0);
    expect(await outbox()).toMatchObject({
      status: "failed",
      last_error: "not sent within 48 hours",
    });
  });

  it("sends an old email an admin requeued", async () => {
    await queued(
      "created_at = now() - interval '49 hours', requeued_at = now() - interval '1 minute'",
    );
    const mailer = new FakeMailer();
    await worker(mailer).sendDue();
    expect(mailer.sent).toHaveLength(1);
    expect((await outbox()).status).toBe("sent");
  });

  it("fails an unknown kind for good", async () => {
    await queued();
    const mailer = new FakeMailer();
    await worker(
      mailer,
      tampered({ claimed: (r) => ({ ...r, kind: "order_lost" }) }),
    ).sendDue();
    expect(mailer.sent).toHaveLength(0);
    expect(await outbox()).toMatchObject({
      status: "failed",
      last_error: 'unknown email kind "order_lost"',
    });
  });

  it("retries after a database blip", async () => {
    await queued();
    await worker(
      new FakeMailer(),
      tampered({ fail: getEmailOrderSql }),
    ).sendDue();
    const row = await outbox();
    expect(row).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "get order: conn reset",
    });
    expect(row.due_in).toBeGreaterThan(60 - 5);
    expect(row.due_in).toBeLessThanOrEqual(60);
  });

  it("leaves an email interrupted by shutdown to its lease", async () => {
    await queued();
    // Aborted mid-send: the claim already happened.
    const stop = new AbortController();
    const mailer = new FakeMailer(new Error("aborted"), () => stop.abort());
    expect(await worker(mailer).sendDue(stop.signal)).toBe(1);
    const row = await outbox();
    expect(row).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: null,
      sent_at: null,
    });
    expect(row.due_in).toBeGreaterThan(10 * 60 - 5); // the lease
  });

  it("drains more than a batch, and never takes a leased email twice", async () => {
    for (let i = 0; i < 4; i++) {
      const order = await placeOrder();
      for (const kind of [
        "order_confirmed",
        "order_shipped",
        "order_refunded",
      ] as const) {
        await enqueue(db, kind, order.id);
      }
    }
    const mailer = new FakeMailer(new Error("down"));
    expect(await worker(mailer).sendDue()).toBe(12);
    // All 12 are waiting for their retry now.
    expect(await worker(new FakeMailer()).sendDue()).toBe(0);
  });
});
