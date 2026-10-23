import { beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "../src/checkout/service";
import type { User } from "../src/db/gen";
import { placeOrder, setupCheckoutApp, stockOf } from "./checkout-helpers";
import { cookieFor, makeUser, signIn } from "./helpers";

// The admin's fulfilment actions: each answers with the order as it now is
// (the same shape as GET /admin/orders/:number), or sends the checkout
// service's refusal as it is.

const ctx = setupCheckoutApp();
const { http, db, cfg, payments, service, deps } = ctx;

let admin = "";
let shopper: User;
beforeEach(async () => {
  payments.reset();
  deps.checkout = service;
  admin = (await signIn(db, cfg, "admin")).cookie;
  shopper = await makeUser(db, { name: "Aino Virtanen" });
});

const post = (path: string, body?: object) => {
  const r = http().post(`/api/v1/admin/orders/${path}`).set("Cookie", admin);
  return body === undefined ? r : r.send(body);
};

describe("POST /admin/orders/:number/ship", () => {
  it("ships a paid order with its tracking number", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    const res = await post(`${number}/ship`, {
      tracking_number: "  JJFI123  ",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order shipped");
    expect(res.body.data).toMatchObject({
      status: "shipped",
      tracking_number: "JJFI123",
      customer: { id: shopper.id, name: "Aino Virtanen" },
    });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toHaveProperty("stock_shortfall", 0);
    expect(res.body.data.payment).not.toBeNull();
  });

  it("ships without a tracking number", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    const res = await post(`${number}/ship`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.tracking_number).toBeNull();
  });

  it("refuses an order that isn't paid", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    await post(`${number}/ship`, {});
    const again = await post(`${number}/ship`, {});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVALID_ORDER_TRANSITION");
  });

  it("validates the order number, the body and the order", async () => {
    expect((await post("abc/ship", {})).body.code).toBe("INVALID_ORDER_NUMBER");
    const missing = await post("99999/ship", {});
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("ORDER_NOT_FOUND");
    const { number } = await placeOrder(ctx, shopper.id);
    const long = await post(`${number}/ship`, {
      tracking_number: "x".repeat(65),
    });
    expect(long.status).toBe(400);
    expect(long.body.errors[0]).toMatchObject({
      code: "TOO_LONG",
      field: "tracking_number",
    });
    const empty = await post(`${number}/ship`);
    expect(empty.status).toBe(400);
    expect(empty.body.errors).toEqual([
      { code: "INVALID_REQUEST", message: "Invalid request body" },
    ]);
  });

  it("is for admins only", async () => {
    const customer = cookieFor(cfg, shopper);
    const res = await http()
      .post("/api/v1/admin/orders/1001/ship")
      .set("Cookie", customer)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("POST /admin/orders/:number/deliver", () => {
  it("delivers a shipped order, and only a shipped one", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    const early = await post(`${number}/deliver`);
    expect(early.status).toBe(409);
    await post(`${number}/ship`, {});
    const res = await post(`${number}/deliver`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "Order delivered",
      data: { status: "delivered" },
    });
    expect(res.body.data.delivered_at).not.toBeNull();
  });
});

describe("POST /admin/orders/:number/cancel", () => {
  it("cancels an unpaid order and returns its stock", async () => {
    const { number, variant } = await placeOrder(ctx, shopper.id, {
      quantity: 2,
      stock: 5,
      paid: false,
    });
    expect(await stockOf(db, variant.id)).toBe(3);
    const res = await post(`${number}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "Order cancelled",
      data: { status: "cancelled", payment: null },
    });
    expect(await stockOf(db, variant.id)).toBe(5);
  });

  it("refuses a paid order", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    const res = await post(`${number}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_ORDER_TRANSITION");
  });
});

describe("POST /admin/orders/:number/refund", () => {
  it("refunds in full, with the stock back when asked", async () => {
    const { number, variant } = await placeOrder(ctx, shopper.id, {
      quantity: 2,
      stock: 5,
    });
    const res = await post(`${number}/refund`, { restock: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "Order refunded",
      data: { status: "refunded" },
    });
    expect(res.body.data.payment.refunded_at).not.toBeNull();
    expect(await stockOf(db, variant.id)).toBe(5);
  });

  it("keeps the stock out without restock", async () => {
    const { number, variant } = await placeOrder(ctx, shopper.id, {
      quantity: 2,
      stock: 5,
    });
    await post(`${number}/refund`, { restock: false });
    expect(await stockOf(db, variant.id)).toBe(3);
  });

  it("requires restock", async () => {
    const { number } = await placeOrder(ctx, shopper.id);
    const res = await post(`${number}/refund`, {});
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "restock",
        message: "Restock is required",
      },
    ]);
    const typed = await post(`${number}/refund`, { restock: "yes" });
    expect(typed.body.errors).toEqual([
      {
        code: "INVALID_TYPE",
        field: "restock",
        message: "Restock must be true or false",
      },
    ]);
  });

  it("answers 503 without payments, before anything else", async () => {
    deps.checkout = new CheckoutService(db, null, cfg.frontendUrl);
    const res = await post("abc/refund", {});
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      message: "Payments are not set up on this server",
      code: "PAYMENTS_UNAVAILABLE",
    });
  });
});
