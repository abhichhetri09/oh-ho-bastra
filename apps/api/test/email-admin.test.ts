import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, type Order } from "../src/db/gen";
import { enqueue, type EmailKind } from "../src/emails/outbox";
import { makeUser, setupTestApp, signIn } from "./helpers";

// GET /admin/emails and POST /admin/emails/:emailID/retry
// (internal/handlers/admin/operations.go).

const { http, db, cfg } = setupTestApp();

let admin = "";
beforeEach(async () => {
  admin = (await signIn(db, cfg, "admin")).cookie;
});

async function placeOrder(): Promise<Order> {
  const user = await makeUser(db);
  const order = await createOrder(db, {
    user_id: user.id,
    subtotal: 2900,
    shipping: 0,
    total: 2900,
    currency: "usd",
    email: "ada@example.com",
    shipping_address: JSON.stringify({ full_name: "Ada" }),
    expires_at: new Date(Date.now() + 60_000),
  });
  return order!;
}

/** Queues an email and gives it status (and an error when failed). */
async function email(
  order: Order,
  kind: EmailKind,
  status = "pending",
  age = 0,
) {
  await enqueue(db, kind, order.id);
  const { rows } = await db.query<{ id: string }>(
    `UPDATE email_outbox SET status = $1, last_error = CASE WHEN $1 = 'failed' THEN 'boom' END,
       attempts = CASE WHEN $1 = 'pending' THEN 0 ELSE 3 END, created_at = now() - make_interval(mins => $4)
     WHERE order_id = $2 AND kind = $3 RETURNING id`,
    [status, order.id, kind, age],
  );
  return rows[0]!.id;
}

describe("GET /admin/emails", () => {
  it("is for admins only", async () => {
    expect((await http().get("/api/v1/admin/emails")).status).toBe(401);
    const { cookie } = await signIn(db, cfg);
    const res = await http().get("/api/v1/admin/emails").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("lists an empty outbox with every status counted", async () => {
    const res = await http().get("/api/v1/admin/emails").set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Emails fetched",
      data: { rows: [], counts: { failed: 0, pending: 0, sent: 0 } },
      meta: { total: 0, total_pages: 0, page: 1, limit: 25, offset: 0 },
    });
  });

  it("lists newest first, filtered by status", async () => {
    const order = await placeOrder();
    const oldest = await email(order, "order_confirmed", "sent", 30);
    const failed = await email(order, "order_shipped", "failed", 20);
    const newest = await email(order, "order_refunded", "pending", 10);

    const res = await http().get("/api/v1/admin/emails").set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.data.counts).toEqual({ failed: 1, pending: 1, sent: 1 });
    expect(Object.keys(res.body.data.counts)).toEqual([
      "failed",
      "pending",
      "sent",
    ]);
    expect(res.body.data.rows.map((r: { id: string }) => r.id)).toEqual([
      newest,
      failed,
      oldest,
    ]);
    expect(res.body.meta).toEqual({
      total: 3,
      total_pages: 1,
      page: 1,
      limit: 25,
      offset: 0,
    });
    const row = res.body.data.rows[1];
    expect(Object.keys(row)).toEqual([
      "id",
      "kind",
      "status",
      "attempts",
      "last_error",
      "created_at",
      "sent_at",
      "next_attempt_at",
      "requeued_at",
      "order_number",
      "email",
    ]);
    expect(row).toMatchObject({
      kind: "order_shipped",
      status: "failed",
      attempts: 3,
      last_error: "boom",
      sent_at: null,
      requeued_at: null,
      order_number: order.number,
      email: "ada@example.com",
    });

    const only = await http()
      .get("/api/v1/admin/emails?status=failed")
      .set("Cookie", admin);
    expect(only.body.data.rows.map((r: { id: string }) => r.id)).toEqual([
      failed,
    ]);
    // The counts are always of the whole outbox.
    expect(only.body.data.counts).toEqual({ failed: 1, pending: 1, sent: 1 });
    expect(only.body.meta.total).toBe(1);
  });

  it("refuses bad query parameters", async () => {
    for (const [path, code, message] of [
      [
        "/api/v1/admin/emails?status=lost",
        "INVALID_QUERY_PARAMETER",
        "status must be pending, sent or failed",
      ],
      [
        "/api/v1/admin/emails?page=-1",
        "INVALID_PAGE_PARAMETER",
        "Invalid page parameter",
      ],
      [
        "/api/v1/admin/emails?page=2",
        "INVALID_PAGE_PARAMETER",
        "Invalid page parameter",
      ],
    ]) {
      const res = await http().get(path!).set("Cookie", admin);
      expect(res.status, path).toBe(400);
      expect(res.body).toEqual({ success: false, code, message });
    }
  });
});

describe("POST /admin/emails/:emailID/retry", () => {
  const retry = (id: string) =>
    http().post(`/api/v1/admin/emails/${id}/retry`).set("Cookie", admin);

  it("sends a failed email back to the queue", async () => {
    const id = await email(await placeOrder(), "order_shipped", "failed", 3000);
    const res = await retry(id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email queued again");
    expect(res.body.data).toMatchObject({
      id,
      status: "pending",
      attempts: 0,
      last_error: null,
    });
    expect(res.body.data.requeued_at).toEqual(expect.any(String));
  });

  it("only retries a failed email", async () => {
    const id = await email(await placeOrder(), "order_confirmed", "sent");
    const res = await retry(id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      code: "EMAIL_NOT_FAILED",
      message: "Only a failed email can be sent again",
    });
  });

  it("answers 404 for an unknown email and 400 for a bad id", async () => {
    const missing = await retry(randomUUID());
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      success: false,
      code: "EMAIL_NOT_FOUND",
      message: "Email not found",
    });

    const bad = await retry("nope");
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      success: false,
      code: "INVALID_EMAIL_ID",
      message: "Invalid email ID",
    });
  });

  it("is for admins only", async () => {
    const { cookie } = await signIn(db, cfg);
    const res = await http()
      .post(`/api/v1/admin/emails/${randomUUID()}/retry`)
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});
