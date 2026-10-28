import { beforeEach, describe, expect, it } from "vitest";
import { shippingFor } from "../src/checkout/shipping";
import type { User } from "../src/db/gen";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
} from "./checkout-helpers";
import { cookieFor, makeUser, signIn } from "./helpers";

// What delivery costs: the rule in store_settings, the admin's endpoint
// for it, and the cart and checkout pricing with whatever it is now.

const { http, db, cfg, payments, service } = setupCheckoutApp();

let user: User;
let cookie = "";
let admin = "";
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  user = await makeUser(db);
  cookie = cookieFor(cfg, user);
  admin = (await signIn(db, cfg, "admin")).cookie;
});

const put = (body: unknown, as = admin) =>
  http()
    .put("/api/v1/admin/settings/shipping")
    .set("Cookie", as)
    .send(body as object);
const getCart = () => http().get("/api/v1/cart").set("Cookie", cookie);
const checkout = () =>
  http().post("/api/v1/checkout").set("Cookie", cookie).send({
    address: ADDRESS,
  });
const orderRow = async (number: number) =>
  (await db.query("SELECT * FROM orders WHERE number = $1", [number])).rows[0];

/** A bag of quantity units at price for the user. */
async function fillBag(price: number, quantity = 1) {
  const { variant } = await makeVariant(db, { price });
  await addToCart(db, user.id, variant.id, quantity);
}

describe("shippingFor", () => {
  it("charges the flat price below the threshold, nothing from it", () => {
    const rule = { flat: 490, free_from: 6000 };
    expect(shippingFor(0, rule)).toBe(490);
    expect(shippingFor(5999, rule)).toBe(490);
    expect(shippingFor(6000, rule)).toBe(0);
  });

  it("never ships free without a threshold, and 0 is always free", () => {
    expect(shippingFor(10_000_000, { flat: 700, free_from: null })).toBe(700);
    expect(shippingFor(1, { flat: 0, free_from: null })).toBe(0);
  });
});

describe("PUT /admin/settings/shipping", () => {
  it("starts at €4.90, free from €60", async () => {
    const res = await http().get("/api/v1/settings");
    expect(res.body.data.shipping).toEqual({ flat: 490, free_from: 6000 });
  });

  it("saves the rule, and the storefront sees it", async () => {
    const res = await put({ flat: 590, free_from: 8000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Delivery price updated",
      data: { shipping: { flat: 590, free_from: 8000 } },
    });
    // the rest of the settings come along, as the other saves send them
    expect(res.body.data).toMatchObject({ theme: "editorial" });
    expect(res.body.data).not.toHaveProperty("shipping_flat");
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.shipping).toEqual({ flat: 590, free_from: 8000 });
  });

  it("never ships free with free_from null or left out", async () => {
    expect(
      (await put({ flat: 490, free_from: null })).body.data.shipping,
    ).toEqual({ flat: 490, free_from: null });
    await put({ flat: 490, free_from: 6000 });
    expect((await put({ flat: 390 })).body.data.shipping).toEqual({
      flat: 390,
      free_from: null,
    });
  });

  it("takes the limits, free delivery for everyone included", async () => {
    expect((await put({ flat: 0, free_from: 1 })).status).toBe(200);
    expect(
      (await put({ flat: 100_000, free_from: 10_000_000 })).body.data.shipping,
    ).toEqual({ flat: 100_000, free_from: 10_000_000 });
  });

  const cases: [string, unknown, string, string][] = [
    ["a negative price", { flat: -1, free_from: 6000 }, "flat", "OUT_OF_RANGE"],
    [
      "a price over €1,000",
      { flat: 100_001, free_from: 6000 },
      "flat",
      "OUT_OF_RANGE",
    ],
    // euros, not cents
    ["part of a cent", { flat: 4.9, free_from: 6000 }, "flat", "INVALID_TYPE"],
    ["no price", { free_from: 6000 }, "flat", "REQUIRED_FIELD"],
    [
      "a threshold of €0",
      { flat: 490, free_from: 0 },
      "free_from",
      "OUT_OF_RANGE",
    ],
    [
      "a threshold over €100,000",
      { flat: 490, free_from: 10_000_001 },
      "free_from",
      "OUT_OF_RANGE",
    ],
    [
      "a threshold as text",
      { flat: 490, free_from: "60" },
      "free_from",
      "INVALID_TYPE",
    ],
  ];
  it.each(cases)("refuses %s", async (_name, body, field, code) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors[0]).toMatchObject({ field, code });
    // nothing changed
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.shipping).toEqual({ flat: 490, free_from: 6000 });
  });

  it("says what's wrong in words the admin can act on", async () => {
    expect((await put({ flat: 100_001 })).body.errors[0].message).toBe(
      "Keep the delivery price to €1,000 or less",
    );
    expect(
      (await put({ flat: 490, free_from: 0 })).body.errors[0].message,
    ).toBe("Free delivery needs a threshold above €0");
  });

  it("is for admins only", async () => {
    const body = { flat: 0, free_from: null };
    expect((await put(body, cookie)).status).toBe(403);
    expect(
      (await http().put("/api/v1/admin/settings/shipping").send(body)).status,
    ).toBe(401);
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.shipping).toEqual({ flat: 490, free_from: 6000 });
  });
});

describe("the cart prices with the saved rule", () => {
  it("charges the saved price below the saved threshold", async () => {
    await put({ flat: 700, free_from: 3000 });
    await fillBag(2999);
    expect((await getCart()).body.data).toMatchObject({
      subtotal: 2999,
      shipping: 700,
      total: 3699,
    });
    await fillBag(1);
    expect((await getCart()).body.data).toMatchObject({
      subtotal: 3000,
      shipping: 0,
      total: 3000,
    });
  });

  it("counts the threshold after the discount code", async () => {
    await put({ flat: 700, free_from: 3000 });
    await db.query(
      "INSERT INTO coupons (code, kind, value) VALUES ('TENOFF', 'percent', 10)",
    );
    await fillBag(3200);
    expect((await getCart()).body.data.shipping).toBe(0);
    const res = await http()
      .put("/api/v1/cart/coupon")
      .set("Cookie", cookie)
      .send({ code: "tenoff" });
    expect(res.body.data).toMatchObject({
      subtotal: 3200,
      discount: 320,
      // 2880 after the code: below the threshold
      shipping: 700,
      total: 3200 - 320 + 700,
    });
  });

  it("never ships free without a threshold", async () => {
    await put({ flat: 490, free_from: null });
    await fillBag(50_000, 2);
    expect((await getCart()).body.data).toMatchObject({
      subtotal: 100_000,
      shipping: 490,
      total: 100_490,
    });
  });

  it("ships an empty bag for nothing whatever the price", async () => {
    await put({ flat: 990, free_from: null });
    expect((await getCart()).body.data).toMatchObject({
      item_count: 0,
      shipping: 0,
      total: 0,
    });
  });
});

describe("checkout charges the saved rule", () => {
  it("puts the saved price on the order and the Stripe page", async () => {
    await put({ flat: 650, free_from: 10_000 });
    await fillBag(6000);
    expect((await checkout()).status).toBe(201);
    expect(await orderRow(1001)).toMatchObject({
      subtotal: 6000,
      shipping: 650,
      total: 6650,
    });
    const session = payments.created[0]!;
    expect(session.shipping).toBe(650);
    // Stripe charges exactly the order's total
    const charged = await payments.getSession("cs_test_1");
    expect(charged.amountTotal).toBe(6650);
  });

  it("ships free from the saved threshold, counted after the code", async () => {
    await put({ flat: 650, free_from: 5000 });
    await db.query(
      "INSERT INTO coupons (code, kind, value) VALUES ('FIVEOFF', 'fixed', 500)",
    );
    await fillBag(5400);
    await http()
      .put("/api/v1/cart/coupon")
      .set("Cookie", cookie)
      .send({ code: "FIVEOFF" });
    expect((await checkout()).status).toBe(201);
    // 4900 after the code: below 5000
    expect(await orderRow(1001)).toMatchObject({
      subtotal: 5400,
      discount: 500,
      shipping: 650,
      total: 5550,
    });
    expect(payments.created[0]!.shipping).toBe(650);
    expect((await payments.getSession("cs_test_1")).amountTotal).toBe(5550);
  });

  it("never ships free without a threshold", async () => {
    await put({ flat: 490, free_from: null });
    await fillBag(20_000);
    expect((await checkout()).status).toBe(201);
    expect(await orderRow(1001)).toMatchObject({
      shipping: 490,
      total: 20_490,
    });
    expect(payments.created[0]!.shipping).toBe(490);
  });

  it("ships free for everyone at a price of 0", async () => {
    await put({ flat: 0, free_from: null });
    await fillBag(100);
    expect((await checkout()).status).toBe(201);
    expect(await orderRow(1001)).toMatchObject({ shipping: 0, total: 100 });
    expect(payments.created[0]!.shipping).toBe(0);
  });

  it("leaves placed orders with what they were charged", async () => {
    await fillBag(2500);
    expect((await checkout()).status).toBe(201);
    expect(await orderRow(1001)).toMatchObject({ shipping: 490, total: 2990 });

    await put({ flat: 990, free_from: null });
    expect(await orderRow(1001)).toMatchObject({ shipping: 490, total: 2990 });
    const res = await http().get("/api/v1/orders/1001").set("Cookie", cookie);
    expect(res.body.data).toMatchObject({ shipping: 490, total: 2990 });

    // the next checkout of the same bag pays the new price
    expect((await checkout()).status).toBe(201);
    expect(await orderRow(1002)).toMatchObject({ shipping: 990, total: 3490 });
  });
});
