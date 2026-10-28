import { beforeEach, describe, expect, it } from "vitest";
import { upsertReview, type User } from "../src/db/gen";
import { placeOrder, setupCheckoutApp } from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const ctx = setupCheckoutApp();
const { http, db, cfg, payments } = ctx;

let user: User;
let cookie = "";
beforeEach(async () => {
  payments.reset();
  user = await makeUser(db);
  cookie = cookieFor(cfg, user);
});

describe("GET /orders", () => {
  it("is an empty first page without orders", async () => {
    const res = await http().get("/api/v1/orders").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Orders fetched",
      data: [],
      meta: { total: 0, total_pages: 0, page: 1, limit: 10, offset: 0 },
    });
  });

  it("lists placed orders newest first, not abandoned checkouts", async () => {
    const first = await placeOrder(ctx, user.id, { quantity: 2 });
    await placeOrder(ctx, user.id, { paid: false }); // replaced by the next one, never paid
    const second = await placeOrder(ctx, user.id);
    await placeOrder(ctx, (await makeUser(db)).id); // someone else's

    const res = await http().get("/api/v1/orders").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({
      total: 2,
      total_pages: 1,
      page: 1,
      limit: 10,
      offset: 0,
    });
    expect(res.body.data.map((o: { number: number }) => o.number)).toEqual([
      second.number,
      first.number,
    ]);
    expect(Object.keys(res.body.data[1]).sort()).toEqual(
      [
        "created_at",
        "currency",
        "id",
        "item_count",
        "number",
        "paid_at",
        "preview_images",
        "status",
        "total",
      ].sort(),
    );
    expect(res.body.data[1]).toMatchObject({
      status: "paid",
      total: 5490,
      currency: "eur",
      item_count: 2,
      preview_images: [],
    });
  });

  it("refuses a page past the last", async () => {
    let res = await http().get("/api/v1/orders?page=2").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PAGE_PARAMETER");
    res = await http().get("/api/v1/orders?page=x").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("needs a signed-in user", async () => {
    expect((await http().get("/api/v1/orders")).status).toBe(401);
  });
});

describe("GET /orders/:number", () => {
  it("is the order with its items and reviewed products", async () => {
    const order = await placeOrder(ctx, user.id, { quantity: 2 });
    await upsertReview(db, {
      product_id: order.product.id,
      user_id: user.id,
      rating: 5,
      title: "Great",
      body: "Lovely tee",
    });

    const res = await http()
      .get(`/api/v1/orders/${order.number}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order fetched");
    const data = res.body.data;
    expect(Object.keys(data)).toEqual([
      "id",
      "number",
      "user_id",
      "status",
      "subtotal",
      "shipping",
      "total",
      "currency",
      "email",
      "shipping_address",
      "stripe_session_id",
      "expires_at",
      "paid_at",
      "cancelled_at",
      "created_at",
      "updated_at",
      "shipped_at",
      "delivered_at",
      "refunded_at",
      "tracking_number",
      "discount",
      "coupon_code",
      "items",
      "reviewed_product_ids",
    ]);
    expect(data).toMatchObject({
      number: order.number,
      status: "paid",
      subtotal: 5000,
      shipping: 490,
      total: 5490,
      cancelled_at: null,
      tracking_number: null,
      shipping_address: {
        full_name: "Ada Lovelace",
        line2: "",
        region: "",
        postal_code: "SW1A 1AA",
      },
      reviewed_product_ids: [order.product.id],
    });
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).not.toHaveProperty("stock_shortfall");
    expect(data.items[0]).toMatchObject({
      order_id: order.id,
      variant_id: order.variant.id,
      product_id: order.product.id,
      options: [],
      unit_price: 2500,
      quantity: 2,
      line_total: 5000,
    });
  });

  it.each(["1001", "+1001", "01001"])("reads %s as order 1001", async (raw) => {
    await placeOrder(ctx, user.id);
    const res = await http().get(`/api/v1/orders/${raw}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.number).toBe(1001);
  });

  it.each(["OHB-1001", "abc", "0", "-5", "1.5", "99999999999999999999"])(
    "refuses %s",
    async (raw) => {
      const res = await http()
        .get(`/api/v1/orders/${raw}`)
        .set("Cookie", cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: "Invalid order number",
        code: "INVALID_ORDER_NUMBER",
      });
    },
  );

  it("is 404 for another user's order or a huge number", async () => {
    const theirs = await placeOrder(ctx, (await makeUser(db)).id);
    for (const n of [String(theirs.number), "9223372036854775807"]) {
      const res = await http().get(`/api/v1/orders/${n}`).set("Cookie", cookie);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }
  });
});
