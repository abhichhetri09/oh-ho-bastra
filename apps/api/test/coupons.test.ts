import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import {
  checkoutCoupon,
  couponRefusal,
  discountFor,
  recordRedemption,
  type CouponCheck,
} from "../src/coupons/coupons";
import type { Coupon, User } from "../src/db/gen";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
  stockOf,
} from "./checkout-helpers";
import { cookieFor, makeUser, signIn } from "./helpers";

// Discount codes: the rules and maths, the bag's apply and remove, checkout
// redeeming a code (and giving the use back when the order is cancelled),
// Stripe's one-off coupon, and the admin endpoints.

const ctx = setupCheckoutApp();
const { http, db, cfg, payments, service, deps } = ctx;

let user: User;
let cookie = "";
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  deps.checkout = service;
  user = await makeUser(db, { email: "ada@example.com" });
  cookie = cookieFor(cfg, user);
});

const HOUR = 3_600_000;

/** A coupon row (percent 10, live, no limits, unless told otherwise). */
async function makeCoupon(
  fields: Partial<Omit<Coupon, "id" | "created_at" | "updated_at">> = {},
): Promise<Coupon> {
  const c = {
    code: "SUMMER10",
    kind: "percent",
    value: 10,
    min_subtotal: 0,
    starts_at: null,
    ends_at: null,
    max_redemptions: null,
    once_per_customer: false,
    is_active: true,
    ...fields,
  };
  const { rows } = await db.query<Coupon>(
    `INSERT INTO coupons (code, kind, value, min_subtotal, starts_at, ends_at,
       max_redemptions, once_per_customer, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      c.code,
      c.kind,
      c.value,
      c.min_subtotal,
      c.starts_at,
      c.ends_at,
      c.max_redemptions,
      c.once_per_customer,
      c.is_active,
    ],
  );
  return rows[0]!;
}

/** A bag of quantity units at price for the user. */
async function fillBag(u: User, price = 2500, quantity = 1, stock = 10) {
  const { variant } = await makeVariant(db, { price, stock });
  await addToCart(db, u.id, variant.id, quantity);
  return variant;
}

const apply = (code: unknown, as = cookie) =>
  http()
    .put("/api/v1/cart/coupon")
    .set("Cookie", as)
    .send({ code } as object);
const getCart = (as = cookie) => http().get("/api/v1/cart").set("Cookie", as);
const checkout = (as = cookie) =>
  http().post("/api/v1/checkout").set("Cookie", as).send({ address: ADDRESS });

const count = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0].n as number;
const redemptions = (couponId: string) =>
  count(
    "SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_id = $1",
    [couponId],
  );
const orderRow = async (number: number) =>
  (await db.query("SELECT * FROM orders WHERE number = $1", [number])).rows[0];
const cartCode = async (u: User) =>
  (await db.query("SELECT coupon_code FROM carts WHERE user_id = $1", [u.id]))
    .rows[0]?.coupon_code ?? null;

/** Pays the order's Stripe page and settles it, as the success page does. */
async function pay(number: number) {
  const order = await orderRow(number);
  payments.pay(order.stripe_session_id);
  await service.reconcile(order.stripe_session_id);
}

describe("the maths", () => {
  it("rounds a percentage down", () => {
    expect(discountFor("percent", 15, 3333)).toBe(499); // 499.95
    expect(discountFor("percent", 10, 6000)).toBe(600);
    expect(discountFor("percent", 100, 2500)).toBe(2500);
    expect(discountFor("percent", 1, 99)).toBe(0);
  });

  it("caps a fixed amount at the subtotal", () => {
    expect(discountFor("fixed", 500, 2500)).toBe(500);
    expect(discountFor("fixed", 5000, 2500)).toBe(2500);
    expect(discountFor("fixed", 500, 0)).toBe(0);
  });
});

describe("the rules", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const coupon = (fields: Partial<Coupon> = {}): Coupon => ({
    id: "c1",
    code: "SUMMER10",
    kind: "percent",
    value: 10,
    min_subtotal: 0,
    starts_at: null,
    ends_at: null,
    max_redemptions: null,
    once_per_customer: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...fields,
  });
  const check: CouponCheck = { subtotal: 5000, email: "a@x.com", now };
  const unused = { used: 0, usedByEmail: 0 };
  const why = (
    c: Coupon | null,
    usage = unused,
    over: Partial<CouponCheck> = {},
  ) => couponRefusal(c, { ...check, ...over }, usage)?.code ?? null;

  it("passes a live code", () => {
    expect(why(coupon())).toBeNull();
  });

  it("hides missing, switched-off and future codes alike", () => {
    expect(why(null)).toBe("COUPON_NOT_FOUND");
    expect(why(coupon({ is_active: false }))).toBe("COUPON_NOT_FOUND");
    expect(why(coupon({ starts_at: new Date(now.getTime() + 1000) }))).toBe(
      "COUPON_NOT_FOUND",
    );
    expect(why(coupon({ starts_at: now }))).toBeNull();
  });

  it("ends at ends_at", () => {
    expect(why(coupon({ ends_at: now }))).toBe("COUPON_EXPIRED");
    expect(why(coupon({ ends_at: new Date(now.getTime() + 1) }))).toBeNull();
  });

  it("counts uses against the limits", () => {
    const limited = coupon({ max_redemptions: 2 });
    expect(why(limited, { used: 1, usedByEmail: 0 })).toBeNull();
    expect(why(limited, { used: 2, usedByEmail: 0 })).toBe("COUPON_USED_UP");
    const once = coupon({ once_per_customer: true });
    expect(why(once, { used: 5, usedByEmail: 0 })).toBeNull();
    expect(why(once, { used: 5, usedByEmail: 1 })).toBe("COUPON_ALREADY_USED");
    // without an email (a guest's bag) that waits for checkout
    expect(why(once, { used: 5, usedByEmail: 1 }, { email: null })).toBeNull();
  });

  it("asks for the minimum last, naming it", () => {
    const min = coupon({ min_subtotal: 5001 });
    const refusal = couponRefusal(min, check, unused);
    expect(refusal).toMatchObject({
      status: 409,
      code: "COUPON_MIN_SUBTOTAL",
      message: "This code needs a subtotal of €50.01 or more",
    });
    expect(why(coupon({ min_subtotal: 5000 }))).toBeNull();
    // a code that's run out says so, not "spend more"
    expect(
      why(coupon({ min_subtotal: 9000, max_redemptions: 1 }), {
        used: 1,
        usedByEmail: 0,
      }),
    ).toBe("COUPON_USED_UP");
  });
});

describe("PUT /cart/coupon", () => {
  it("needs a signed-in user", async () => {
    const res = await http().put("/api/v1/cart/coupon").send({ code: "X" });
    expect(res.status).toBe(401);
  });

  it("applies a code in any case and shows the maths", async () => {
    await makeCoupon({ code: "SUMMER10", value: 10 });
    await fillBag(user, 2500, 2);
    const res = await apply("  summer10 ");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Code applied");
    expect(res.body.data).toMatchObject({
      subtotal: 5000,
      discount: 500,
      shipping: 490,
      total: 4990,
      coupon: {
        code: "SUMMER10",
        kind: "percent",
        value: 10,
        discount: 500,
        issue: null,
      },
    });
    expect(await cartCode(user)).toBe("SUMMER10");
    // and on every read
    expect((await getCart()).body.data.coupon.discount).toBe(500);
  });

  it("takes a percentage off sale prices", async () => {
    await makeCoupon({ value: 20 });
    const { variant } = await makeVariant(db, { price: 4000 });
    await db.query(
      "UPDATE product_variants SET offer_price = 3000 WHERE id = $1",
      [variant.id],
    );
    await addToCart(db, user.id, variant.id);
    const res = await apply("summer10");
    expect(res.body.data).toMatchObject({
      subtotal: 3000,
      discount: 600,
      total: 3000 - 600 + 490,
    });
  });

  it("works out free shipping after the discount", async () => {
    await makeCoupon({ value: 10 });
    await fillBag(user, 6000);
    expect((await getCart()).body.data).toMatchObject({
      subtotal: 6000,
      shipping: 0,
      total: 6000,
    });
    const res = await apply("SUMMER10");
    expect(res.body.data).toMatchObject({
      subtotal: 6000,
      discount: 600,
      shipping: 490,
      total: 5890,
    });
  });

  it("caps a fixed amount at the subtotal", async () => {
    await makeCoupon({ code: "TENNER", kind: "fixed", value: 5000 });
    await fillBag(user, 2500);
    const res = await apply("tenner");
    expect(res.body.data).toMatchObject({
      subtotal: 2500,
      discount: 2500,
      shipping: 490,
      total: 490,
      coupon: { kind: "fixed", value: 5000, discount: 2500 },
    });
  });

  it("replaces the code already on the bag", async () => {
    await makeCoupon({ code: "FIRST" });
    await makeCoupon({ code: "SECOND", kind: "fixed", value: 100 });
    await fillBag(user);
    await apply("first");
    const res = await apply("second");
    expect(res.body.data.coupon.code).toBe("SECOND");
    expect(res.body.data.discount).toBe(100);
  });

  it("refuses each kind of unusable code, keeping the bag's own", async () => {
    const past = new Date(Date.now() - HOUR);
    const future = new Date(Date.now() + HOUR);
    await makeCoupon({ code: "GOOD" });
    await makeCoupon({ code: "OFF", is_active: false });
    await makeCoupon({ code: "LATER", starts_at: future });
    await makeCoupon({ code: "OLD", ends_at: past });
    await makeCoupon({ code: "BIG", min_subtotal: 5000 });
    const gone = await makeCoupon({ code: "GONE", max_redemptions: 1 });
    await db.query(
      "INSERT INTO orders (user_id, subtotal, shipping, total, email, shipping_address, expires_at) VALUES ($1, 100, 0, 100, 'x@example.com', '{}', now())",
      [user.id],
    );
    await db.query(
      "INSERT INTO coupon_redemptions (coupon_id, order_id, email) SELECT $1, id, 'x@example.com' FROM orders",
      [gone.id],
    );
    await fillBag(user);
    expect((await apply("good")).status).toBe(200);

    const cases: [string, number, string, string][] = [
      ["nope", 404, "COUPON_NOT_FOUND", "This code isn't valid"],
      ["no way!", 404, "COUPON_NOT_FOUND", "This code isn't valid"],
      ["off", 404, "COUPON_NOT_FOUND", "This code isn't valid"],
      ["later", 404, "COUPON_NOT_FOUND", "This code isn't valid"],
      ["old", 409, "COUPON_EXPIRED", "This code has expired"],
      [
        "big",
        409,
        "COUPON_MIN_SUBTOTAL",
        "This code needs a subtotal of €50.00 or more",
      ],
      ["gone", 409, "COUPON_USED_UP", "This code has been used up"],
    ];
    for (const [code, status, errCode, message] of cases) {
      const res = await apply(code);
      expect(res.status, code).toBe(status);
      expect(res.body, code).toEqual({
        success: false,
        code: errCode,
        message,
      });
    }
    expect(await cartCode(user)).toBe("GOOD");
  });

  it("validates the body", async () => {
    const res = await apply("");
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { code: "REQUIRED_FIELD", field: "code", message: "Code is required" },
    ]);
    expect((await apply(42)).status).toBe(400);
  });

  it("refuses a code the customer used before", async () => {
    await makeCoupon({ once_per_customer: true });
    await fillBag(user);
    await apply("summer10");
    expect((await checkout()).status).toBe(201);
    await pay(1001);

    await fillBag(user);
    const res = await apply("SUMMER10");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COUPON_ALREADY_USED");
    // others still can
    const other = await makeUser(db);
    await fillBag(other);
    expect((await apply("summer10", cookieFor(cfg, other))).status).toBe(200);
  });

  it("limits failed codes per user", async () => {
    const limited = request(
      buildApp({ ...deps, cfg: { ...cfg, authRateLimits: true } }).app,
    );
    const attempt = (code: string, as = cookie) =>
      limited.put("/api/v1/cart/coupon").set("Cookie", as).send({ code });
    await makeCoupon();
    await fillBag(user);
    // a code that works never counts
    expect((await attempt("summer10")).status).toBe(200);
    for (let i = 0; i < 10; i++) {
      expect((await attempt(`GUESS${i}`)).status).toBe(404);
    }
    const blocked = await attempt("summer10");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // another user has their own count
    const other = await makeUser(db);
    expect((await attempt("GUESS", cookieFor(cfg, other))).status).toBe(404);
  });
});

describe("a code on the bag", () => {
  it("stays with its issue when it stops applying", async () => {
    const coupon = await makeCoupon({ min_subtotal: 5000 });
    const variant = await fillBag(user, 2500, 2);
    await apply("summer10");

    await http()
      .patch(`/api/v1/cart/items/${variant.id}`)
      .set("Cookie", cookie)
      .send({ quantity: 1 });
    let cart = (await getCart()).body.data;
    expect(cart).toMatchObject({
      subtotal: 2500,
      discount: 0,
      shipping: 490,
      total: 2990,
      coupon: {
        code: "SUMMER10",
        kind: "percent",
        value: 10,
        discount: 0,
        issue: {
          code: "COUPON_MIN_SUBTOTAL",
          message: "This code needs a subtotal of €50.00 or more",
        },
      },
    });

    // back over the minimum, it applies again
    await addToCart(db, user.id, variant.id, 2);
    expect((await getCart()).body.data.coupon).toMatchObject({
      discount: 500,
      issue: null,
    });

    await db.query(
      "UPDATE coupons SET ends_at = now() - interval '1 minute', starts_at = now() - interval '1 day' WHERE id = $1",
      [coupon.id],
    );
    expect((await getCart()).body.data.coupon.issue.code).toBe(
      "COUPON_EXPIRED",
    );

    // switched off, it says no more than an unknown code would
    await db.query("UPDATE coupons SET is_active = false WHERE id = $1", [
      coupon.id,
    ]);
    cart = (await getCart()).body.data;
    expect(cart.coupon).toEqual({
      code: "SUMMER10",
      kind: null,
      value: null,
      discount: 0,
      issue: { code: "COUPON_NOT_FOUND", message: "This code isn't valid" },
    });
    expect(cart.total).toBe(cart.subtotal + cart.shipping);
  });

  it("comes off with DELETE /cart/coupon, even when there is none", async () => {
    await makeCoupon();
    await fillBag(user);
    await apply("summer10");
    let res = await http().delete("/api/v1/cart/coupon").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Code removed");
    expect(res.body.data).toMatchObject({ coupon: null, discount: 0 });
    res = await http().delete("/api/v1/cart/coupon").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});

describe("checkout with a code", () => {
  it("charges the discounted total through a one-off Stripe coupon", async () => {
    const coupon = await makeCoupon({ value: 15 });
    const variant = await fillBag(user, 3333, 1, 5);
    await apply("summer10");

    const res = await checkout();
    expect(res.status).toBe(201);
    const order = await orderRow(1001);
    expect(order).toMatchObject({
      subtotal: 3333,
      discount: 499,
      coupon_code: "SUMMER10",
      shipping: 490,
      total: 3333 - 499 + 490,
    });
    const req = payments.created[0]!;
    expect(req.discount).toEqual({ amount: 499, name: "SUMMER10" });
    // Stripe's total is the order's
    const session = await payments.getSession(order.stripe_session_id);
    expect(session.amountTotal).toBe(order.total);
    expect(await stockOf(db, variant.id)).toBe(4);

    // the pending order holds the code's use; the bag keeps the code
    expect(await redemptions(coupon.id)).toBe(1);
    expect(
      (await db.query("SELECT email FROM coupon_redemptions")).rows[0].email,
    ).toBe("ada@example.com");
    expect(await cartCode(user)).toBe("SUMMER10");

    await pay(1001);
    expect((await orderRow(1001)).status).toBe("paid");
    const payment = (
      await db.query("SELECT amount FROM payments WHERE order_id = $1", [
        order.id,
      ])
    ).rows[0];
    expect(payment.amount).toBe(order.total);
    // paid: the code leaves the bag, its use stays
    expect(await cartCode(user)).toBeNull();
    expect(await redemptions(coupon.id)).toBe(1);
  });

  it("sends no discount without a code", async () => {
    await fillBag(user);
    expect((await checkout()).status).toBe(201);
    expect(payments.created[0]!.discount).toBeNull();
    expect(await orderRow(1001)).toMatchObject({
      discount: 0,
      coupon_code: null,
    });
  });

  it("keeps another code applied since payment started", async () => {
    await makeCoupon({ code: "FIRST" });
    await makeCoupon({ code: "SECOND" });
    await fillBag(user);
    await apply("first");
    expect((await checkout()).status).toBe(201);
    await apply("second");
    await pay(1001);
    expect(await cartCode(user)).toBe("SECOND");
  });

  it("refuses a code that stopped applying, and creates nothing", async () => {
    const coupon = await makeCoupon({ min_subtotal: 2000 });
    const variant = await fillBag(user, 2500);
    await apply("summer10");
    await db.query(
      "UPDATE coupons SET ends_at = now() - interval '1 second' WHERE id = $1",
      [coupon.id],
    );
    const res = await checkout();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      code: "COUPON_EXPIRED",
      message: "This code has expired",
    });
    expect(await count("SELECT count(*)::int AS n FROM orders")).toBe(0);
    expect(await redemptions(coupon.id)).toBe(0);
    expect(await stockOf(db, variant.id)).toBe(10);
    expect(payments.created).toHaveLength(0);

    // an unknown code is a 409 here too: it's the bag that needs fixing
    await db.query("UPDATE carts SET coupon_code = 'NOPE'");
    const unknown = await checkout();
    expect(unknown.status).toBe(409);
    expect(unknown.body.code).toBe("COUPON_NOT_FOUND");
  });

  it("gives the use back when the order is released", async () => {
    const coupon = await makeCoupon({ max_redemptions: 1 });
    await fillBag(user);
    await apply("summer10");
    expect((await checkout()).status).toBe(201);
    expect(await redemptions(coupon.id)).toBe(1);

    // a new checkout replaces the old one, and its use
    expect((await checkout()).status).toBe(201);
    expect(await redemptions(coupon.id)).toBe(1);
    expect((await orderRow(1001)).status).toBe("cancelled");
    expect(
      (
        await db.query(
          "SELECT o.number FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id",
        )
      ).rows[0].number,
    ).toBe(1002);

    // the page expiring
    const order = await orderRow(1002);
    await service.handleEvent({
      id: "evt_1",
      type: "checkout.session.expired",
      kind: "expired",
      session: { ...(await payments.getSession(order.stripe_session_id)) },
    });
    expect(await redemptions(coupon.id)).toBe(0);
    // the bag still has its code
    expect(await cartCode(user)).toBe("SUMMER10");
  });

  it("gives the use back when the admin cancels the order", async () => {
    const coupon = await makeCoupon();
    await fillBag(user);
    await apply("summer10");
    await checkout();
    const admin = (await signIn(db, cfg, "admin")).cookie;
    const res = await http()
      .post("/api/v1/admin/orders/1001/cancel")
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "cancelled",
      discount: 250,
      coupon_code: "SUMMER10",
    });
    expect(await redemptions(coupon.id)).toBe(0);
  });

  it("takes the use back for an order paid after its release", async () => {
    const coupon = await makeCoupon();
    await fillBag(user);
    await apply("summer10");
    await checkout();
    await service.release((await orderRow(1001)).id);
    expect(await redemptions(coupon.id)).toBe(0);
    await pay(1001);
    expect((await orderRow(1001)).status).toBe("paid");
    expect(await redemptions(coupon.id)).toBe(1);
  });

  it("keeps the use of a refunded order, refunding what was paid", async () => {
    const coupon = await makeCoupon();
    await fillBag(user);
    await apply("summer10");
    await checkout();
    await pay(1001);
    const admin = (await signIn(db, cfg, "admin")).cookie;
    const res = await http()
      .post("/api/v1/admin/orders/1001/refund")
      .set("Cookie", admin)
      .send({ restock: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "refunded", total: 2740 });
    // the whole payment intent, which Stripe charged at the order's total
    expect(payments.refunds).toHaveLength(1);
    expect(res.body.data.payment.amount).toBe(2740);
    expect(await redemptions(coupon.id)).toBe(1);
  });

  it("enforces the limit across customers", async () => {
    await makeCoupon({ max_redemptions: 1 });
    await fillBag(user);
    await apply("summer10");
    const bob = await makeUser(db);
    const bobCookie = cookieFor(cfg, bob);
    await fillBag(bob);
    await apply("summer10", bobCookie);

    expect((await checkout()).status).toBe(201);
    // Ada's unpaid checkout holds the only use
    const refused = await checkout(bobCookie);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("COUPON_USED_UP");
    expect((await getCart(bobCookie)).body.data.coupon.issue.code).toBe(
      "COUPON_USED_UP",
    );

    await service.release((await orderRow(1001)).id);
    expect((await checkout(bobCookie)).status).toBe(201);
  });

  it("lets a customer restart their own checkout of a once-only code", async () => {
    await makeCoupon({ once_per_customer: true });
    await fillBag(user);
    await apply("summer10");
    expect((await checkout()).status).toBe(201);
    // the first (unpaid) checkout is replaced, so its use doesn't count
    expect((await checkout()).status).toBe(201);
    await pay(1002);
    await fillBag(user);
    await db.query("UPDATE carts SET coupon_code = 'SUMMER10'");
    const again = await checkout();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("COUPON_ALREADY_USED");
  });

  it("gives the last use to one of two checkouts at once", async () => {
    const coupon = await makeCoupon({ max_redemptions: 1 });
    const shoppers = [user, await makeUser(db), await makeUser(db)];
    for (const s of shoppers) {
      await fillBag(s);
      await db.query(
        "UPDATE carts SET coupon_code = 'SUMMER10' WHERE user_id = $1",
        [s.id],
      );
    }
    const results = await Promise.allSettled(
      shoppers.map((s) => service.start(s.id, { address: ADDRESS })),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(2);
    for (const r of lost) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
        code: "COUPON_USED_UP",
      });
    }
    expect(await redemptions(coupon.id)).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM orders")).toBe(1);
  });

  it("makes a second checkout wait for the first's use, then count it", async () => {
    await makeCoupon({ max_redemptions: 1 });
    const { rows } = await db.query<{ id: string; email: string }>(
      "INSERT INTO orders (user_id, subtotal, shipping, total, email, shipping_address, expires_at) VALUES ($1, 2500, 0, 2500, 'Ada@Example.com', '{}', now()) RETURNING id, email",
      [user.id],
    );
    const check = { subtotal: 2500, email: "bob@example.com", now: new Date() };
    const first = await db.connect();
    const second = await db.connect();
    try {
      await first.query("BEGIN");
      const { coupon } = await checkoutCoupon(first, "summer10", check);
      await second.query("BEGIN");
      let settled = false;
      const waiting = checkoutCoupon(second, "SUMMER10", check).finally(() => {
        settled = true;
      });
      waiting.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 200));
      expect(settled).toBe(false); // held by the first checkout's lock

      await recordRedemption(first, coupon, rows[0]!);
      await first.query("COMMIT");
      await expect(waiting).rejects.toMatchObject({
        status: 409,
        code: "COUPON_USED_UP",
      });
    } finally {
      await second.query("ROLLBACK");
      first.release();
      second.release();
    }
    expect(
      (await db.query("SELECT email FROM coupon_redemptions")).rows[0].email,
    ).toBe("ada@example.com");
  });
});

describe("admin coupons", () => {
  let admin = "";
  beforeEach(async () => {
    admin = (await signIn(db, cfg, "admin")).cookie;
  });
  const as = (method: "get" | "post" | "put" | "delete", path = "") =>
    http()[method](`/api/v1/admin/coupons${path}`).set("Cookie", admin);

  const body = {
    code: " welcome-5 ",
    kind: "fixed",
    value: 500,
    min_subtotal: 3000,
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2027-01-01T00:00:00Z",
    max_redemptions: 100,
    once_per_customer: true,
  };

  it("is for admins only", async () => {
    expect((await http().get("/api/v1/admin/coupons")).status).toBe(401);
    for (const [method, path] of [
      ["get", ""],
      ["post", ""],
      ["put", "/0f6ada99-b884-4c07-88d4-7843a41cdda8"],
      ["put", "/0f6ada99-b884-4c07-88d4-7843a41cdda8/active"],
      ["delete", "/0f6ada99-b884-4c07-88d4-7843a41cdda8"],
    ] as const) {
      const res = await http()
        [method](`/api/v1/admin/coupons${path}`)
        .set("Cookie", cookie)
        .send({});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("creates a coupon, uppercasing its code", async () => {
    const res = await as("post").send(body);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Coupon created");
    expect(res.body.data).toEqual({
      id: expect.any(String),
      code: "WELCOME-5",
      kind: "fixed",
      value: 500,
      min_subtotal: 3000,
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2027-01-01T00:00:00.000Z",
      max_redemptions: 100,
      once_per_customer: true,
      is_active: true,
      created_at: expect.any(String),
      updated_at: expect.any(String),
      redemptions: 0,
    });

    const plain = await as("post").send({
      code: "plain",
      kind: "percent",
      value: 100,
    });
    expect(plain.body.data).toMatchObject({
      min_subtotal: 0,
      starts_at: null,
      ends_at: null,
      max_redemptions: null,
      once_per_customer: false,
      is_active: true,
    });
  });

  it("refuses a code another coupon has, in any case", async () => {
    await makeCoupon({ code: "WELCOME-5" });
    const res = await as("post").send(body);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      code: "COUPON_ALREADY_EXISTS",
      message: "Another coupon has this code",
      errors: [
        {
          code: "DUPLICATE_ITEM",
          field: "code",
          message: "WELCOME-5 is already a coupon's code",
        },
      ],
    });
  });

  it("validates the body", async () => {
    const res = await as("post").send({
      code: "a b",
      kind: "percent",
      value: 150,
      starts_at: "2026-02-01T00:00:00Z",
      ends_at: "2026-01-01T00:00:00Z",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_FORMAT",
        field: "code",
        message: "Use 3 to 32 letters, digits, hyphens or underscores",
      },
      {
        code: "OUT_OF_RANGE",
        field: "value",
        message: "A percentage can be at most 100",
      },
      {
        code: "OUT_OF_RANGE",
        field: "ends_at",
        message: "The end must be after the start",
      },
    ]);
    const kind = await as("post").send({ ...body, kind: "bogo" });
    expect(kind.body.errors[0]).toMatchObject({
      field: "kind",
      code: "INVALID_VALUE",
    });
    const zero = await as("post").send({ ...body, value: 0 });
    expect(zero.body.errors[0]).toMatchObject({ field: "value" });
  });

  it("lists coupons newest first with their uses", async () => {
    const old = await makeCoupon({ code: "OLDER" });
    await db.query(
      "UPDATE coupons SET created_at = now() - interval '1 day' WHERE id = $1",
      [old.id],
    );
    await makeCoupon({ code: "NEWER" });
    await fillBag(user);
    await apply("older");
    await checkout();

    const res = await as("get");
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { code: string }) => c.code)).toEqual([
      "NEWER",
      "OLDER",
    ]);
    expect(res.body.data[1].redemptions).toBe(1);
    expect(res.body.meta).toEqual({
      total: 2,
      total_pages: 1,
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect((await as("get", "?page=2")).body.code).toBe(
      "INVALID_PAGE_PARAMETER",
    );
  });

  it("replaces a coupon", async () => {
    const coupon = await makeCoupon({ max_redemptions: 5 });
    await makeCoupon({ code: "TAKEN" });
    const res = await as("put", `/${coupon.id}`).send({
      code: "summer20",
      kind: "percent",
      value: 20,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      code: "SUMMER20",
      value: 20,
      max_redemptions: null,
      is_active: true,
    });
    const dup = await as("put", `/${coupon.id}`).send({
      ...body,
      code: "taken",
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("COUPON_ALREADY_EXISTS");
    const missing = await as(
      "put",
      "/0f6ada99-b884-4c07-88d4-7843a41cdda8",
    ).send(body);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("COUPON_NOT_FOUND");
    const bad = await as("put", "/nope").send(body);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_COUPON_ID");
  });

  it("switches a coupon off and on", async () => {
    const coupon = await makeCoupon();
    await fillBag(user);
    let res = await as("put", `/${coupon.id}/active`).send({
      is_active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Coupon switched off");
    expect(res.body.data.is_active).toBe(false);
    expect((await apply("summer10")).body.code).toBe("COUPON_NOT_FOUND");

    res = await as("put", `/${coupon.id}/active`).send({ is_active: true });
    expect(res.body.message).toBe("Coupon switched on");
    expect((await apply("summer10")).status).toBe(200);
    expect((await as("put", `/${coupon.id}/active`).send({})).body.code).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("deletes only a coupon nobody used", async () => {
    const unused = await makeCoupon({ code: "UNUSED" });
    const used = await makeCoupon({ code: "USED" });
    await fillBag(user);
    await apply("used");
    await checkout();

    let res = await as("delete", `/${used.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      code: "COUPON_IN_USE",
      message:
        "This code has been used, so it can't be deleted. Switch it off instead.",
    });
    res = await as("delete", `/${unused.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Coupon deleted");
    expect((await as("delete", `/${unused.id}`)).status).toBe(404);

    // a cancelled order gave its use back, so it can go
    await service.release((await orderRow(1001)).id);
    expect((await as("delete", `/${used.id}`)).status).toBe(200);
    // and the bag shows the code as unknown
    expect((await getCart()).body.data.coupon.issue.code).toBe(
      "COUPON_NOT_FOUND",
    );
  });
});
