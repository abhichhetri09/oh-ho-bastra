import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "../src/db/gen";
import type { Mailer, Message } from "../src/emails/mailer";
import {
  creditCap,
  creditLots,
  expiryFrom,
  loadCredit,
  settleCredit,
  type LedgerRow,
} from "../src/referrals/credit";
import {
  friendDiscount,
  maskEmail,
  referralBase,
} from "../src/referrals/referrals";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  placeOrder,
  setupCheckoutApp,
} from "./checkout-helpers";
import { cookieFor, makeGuest, makeUser, signIn } from "./helpers";

// The referral programme at work: codes, a friend's discount on the bag
// and at checkout, payouts and the monthly cap, store credit (spent online
// and at the counter, given back on refund, expiring) and the admin's
// list. The settings endpoint has its own test (referrals.test.ts).

const ctx = setupCheckoutApp();
const { http, db, cfg, payments, service } = ctx;

class FakeMailer implements Mailer {
  sent: Message[] = [];
  async send(msg: Message) {
    this.sent.push(msg);
  }
}

const DAY = 24 * 60 * 60_000;

let referrer: User;
let referrerCookie = "";
let admin = "";
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  ctx.deps.mailer = null;
  referrer = await makeUser(db, { name: "Rita Referrer" });
  referrerCookie = cookieFor(cfg, referrer);
  admin = (await signIn(db, cfg, "admin")).cookie;
});

/** Turns the programme on, with the rule's fields as given. */
async function enable(rule: Record<string, unknown> = {}) {
  const res = await http()
    .put("/api/v1/admin/settings/referrals")
    .set("Cookie", admin)
    .send({
      enabled: true,
      friend_kind: "amount",
      friend_value: 500,
      reward: 500,
      pay_after_days: 30,
      custom_prints: false,
      credit_max_percent: 30,
      ...rule,
    });
  expect(res.status).toBe(200);
}

/** The referrer's code, from their account page. */
async function codeOf(cookie = referrerCookie): Promise<string> {
  const res = await http()
    .get("/api/v1/account/referrals")
    .set("Cookie", cookie);
  expect(res.status).toBe(200);
  return res.body.data.code as string;
}

const applyReferral = (cookie: string, code: string) =>
  http().put("/api/v1/cart/referral").set("Cookie", cookie).send({ code });
const getCart = (cookie: string) =>
  http().get("/api/v1/cart").set("Cookie", cookie);

/** A friend with a bag of one item at price. */
async function friendWithBag(price = 3000, custom = false) {
  const friend = await makeUser(db);
  const { variant, product } = await makeVariant(db, { price });
  if (custom) await makeCustom(product.id);
  await addToCart(db, friend.id, variant.id);
  return { friend, cookie: cookieFor(cfg, friend) };
}

/** Puts a product under the "custom" category (a custom print). */
async function makeCustom(productId: string) {
  const { rows } = await db.query(
    `INSERT INTO categories (name, slug) VALUES ('Custom', 'custom')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  await db.query("UPDATE products SET category_id = $1 WHERE id = $2", [
    rows[0].id,
    productId,
  ]);
}

/** Checks out the user's bag and pays it; resolves to the order row. */
async function checkoutAndPay(userId: string, req: object = {}) {
  const { order_number } = await service.start(userId, {
    address: ADDRESS,
    ...req,
  });
  const order = await orderRow(order_number);
  payments.pay(order.stripe_session_id);
  await service.reconcile(order.stripe_session_id);
  return orderRow(order_number);
}

const orderRow = async (number: number) =>
  (await db.query("SELECT * FROM orders WHERE number = $1", [number])).rows[0];
const referralRow = async (orderId: string) =>
  (await db.query("SELECT * FROM referrals WHERE order_id = $1", [orderId]))
    .rows[0];
const ledger = async (userId: string) =>
  (
    await db.query(
      "SELECT kind, amount FROM credit_ledger WHERE user_id = $1 ORDER BY created_at",
      [userId],
    )
  ).rows;

/** Ships and delivers an order (delivered now). */
async function deliver(number: number) {
  await service.ship(number, "");
  await service.deliver(number);
}

/** Gives a customer credit by hand. */
const grant = (userId: string, amount: number) =>
  http()
    .post(`/api/v1/admin/credit/customers/${userId}/adjust`)
    .set("Cookie", admin)
    .send({ amount, note: "Goodwill" });

describe("the friend's discount", () => {
  it("takes an amount off, up to the whole base", () => {
    const rule = { friend_kind: "amount" as const, friend_value: 500 };
    expect(friendDiscount(rule, 3000)).toBe(500);
    expect(friendDiscount(rule, 300)).toBe(300);
    expect(friendDiscount(rule, 0)).toBe(0);
  });

  it("takes a percent off, rounded down", () => {
    const rule = { friend_kind: "percent" as const, friend_value: 15 };
    expect(friendDiscount(rule, 2999)).toBe(449);
  });

  it("leaves custom prints out unless the rule takes them", () => {
    const lines = [
      { price: 2000, quantity: 2, custom_print: false },
      { price: 3500, quantity: 1, custom_print: true },
    ];
    expect(referralBase(lines, false)).toBe(4000);
    expect(referralBase(lines, true)).toBe(7500);
  });

  it("masks the friend's email for the referrer", () => {
    expect(maskEmail("ada@example.com")).toBe("a***@example.com");
  });
});

describe("referral codes", () => {
  it("gives each customer one code that never changes", async () => {
    await enable();
    const code = await codeOf();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(await codeOf()).toBe(code);
    const other = cookieFor(cfg, await makeUser(db));
    expect(await codeOf(other)).not.toBe(code);
  });

  it("shows the account page only while the programme runs", async () => {
    const res = await http()
      .get("/api/v1/account/referrals")
      .set("Cookie", referrerCookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("REFERRALS_DISABLED");
    const guest = cookieFor(cfg, await makeGuest(db));
    await enable();
    expect(
      (await http().get("/api/v1/account/referrals").set("Cookie", guest))
        .status,
    ).toBe(403);
  });

  it("is unknown while the programme is off", async () => {
    await enable();
    const code = await codeOf();
    await enable({ enabled: false });
    const { cookie } = await friendWithBag();
    const res = await applyReferral(cookie, code);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "REFERRAL_NOT_FOUND",
      message: "Referral offers aren't running right now",
    });
  });

  it("shows a code already on the bag as not applying once the programme stops", async () => {
    await enable();
    const code = await codeOf();
    const { cookie } = await friendWithBag(3000);
    await applyReferral(cookie, code);
    await enable({ enabled: false });
    expect((await getCart(cookie)).body.data).toMatchObject({
      discount: 0,
      referral: {
        applied: false,
        issue: {
          code: "REFERRAL_NOT_FOUND",
          message: "Referral offers aren't running right now",
        },
      },
    });
  });
});

describe("GET /referrals/:code", () => {
  const offer = (code: string) => http().get(`/api/v1/referrals/${code}`);

  it("says what a link offers, without signing in", async () => {
    await enable({
      friend_kind: "percent",
      friend_value: 10,
      friend_min: 4000,
    });
    const code = await codeOf();
    const res = await offer(code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Referral offer fetched",
      data: {
        code,
        friend_kind: "percent",
        friend_value: 10,
        friend_min: 4000,
      },
    });
  });

  it("works for an admin's own code too", async () => {
    await enable();
    const code = await codeOf(admin);
    expect((await offer(code)).status).toBe(200);
  });

  it("is REFERRAL_NOT_FOUND for an unknown code, in words", async () => {
    await enable();
    for (const code of ["ZZZZZZZZ", "not-a-code"]) {
      const res = await offer(code);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        code: "REFERRAL_NOT_FOUND",
        message: "This referral link isn't valid",
      });
    }
  });

  it("says when the programme is off", async () => {
    await enable();
    const code = await codeOf();
    await enable({ enabled: false });
    const res = await offer(code);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "REFERRAL_NOT_FOUND",
      message: "Referral offers aren't running right now",
    });
  });
});

describe("who can use a code", () => {
  it("puts it on a first-timer's bag, with the discount", async () => {
    await enable();
    const code = await codeOf();
    const { cookie } = await friendWithBag(3000);
    const res = await applyReferral(cookie, code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subtotal: 3000,
      discount: 500,
      referral: { code, discount: 500, applied: true, issue: null },
    });
  });

  it("works for a guest's bag too", async () => {
    await enable();
    const code = await codeOf();
    const guest = await makeGuest(db);
    const { variant } = await makeVariant(db, { price: 3000 });
    await addToCart(db, guest.id, variant.id);
    const res = await applyReferral(cookieFor(cfg, guest), code);
    expect(res.status).toBe(200);
    expect(res.body.data.discount).toBe(500);
  });

  it("refuses the referrer's own code", async () => {
    await enable();
    const code = await codeOf();
    const { variant } = await makeVariant(db);
    await addToCart(db, referrer.id, variant.id);
    const res = await applyReferral(referrerCookie, code);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REFERRAL_OWN_CODE");
  });

  it("refuses a customer who has paid for an order", async () => {
    await enable();
    const code = await codeOf();
    const friend = await makeUser(db);
    await placeOrder(ctx, friend.id);
    const { variant } = await makeVariant(db);
    await addToCart(db, friend.id, variant.id);
    const res = await applyReferral(cookieFor(cfg, friend), code);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REFERRAL_NOT_FIRST_ORDER");
  });

  it("refuses a guest whose email has a paid order, at checkout", async () => {
    await enable();
    const code = await codeOf();
    const friend = await makeUser(db, { email: "returning@example.com" });
    await placeOrder(ctx, friend.id);
    // the same person, now shopping as a guest
    const guest = await makeGuest(db);
    const { variant } = await makeVariant(db, { price: 3000 });
    await addToCart(db, guest.id, variant.id);
    expect((await applyReferral(cookieFor(cfg, guest), code)).status).toBe(200);
    // refused with why, before a payment page opens, and taken off the bag
    const pages = payments.created.length;
    await expect(
      service.start(guest.id, {
        address: ADDRESS,
        email: "returning@example.com",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REFERRAL_NOT_FIRST_ORDER",
      message:
        "A friend's discount is for a first order, so your friend's discount was removed. Check the new total and pay again.",
    });
    expect(payments.created).toHaveLength(pages);
    expect((await getCart(cookieFor(cfg, guest))).body.data).toMatchObject({
      referral: null,
      total: 3490,
    });
    // paying again goes on at the new total
    const order = await checkoutAndPay(guest.id, {
      email: "returning@example.com",
    });
    expect(order).toMatchObject({ discount: 0, total: 3490 });
    expect(await referralRow(order.id)).toBeUndefined();
  });

  it("keeps a code below the minimum, with why, and checkout drops it", async () => {
    await enable({ friend_min: 5000 });
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(3000);
    const res = await applyReferral(cookie, code);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      discount: 0,
      referral: {
        discount: 0,
        issue: {
          code: "REFERRAL_MIN_SUBTOTAL",
          message: "The friend's discount needs a subtotal of €50.00 or more",
        },
      },
    });
    // checkout says so too (the storefront takes it off first)
    await expect(
      service.start(friend.id, { address: ADDRESS }),
    ).rejects.toMatchObject({ code: "REFERRAL_MIN_SUBTOTAL" });
    const order = await checkoutAndPay(friend.id);
    expect(order.discount).toBe(0);
  });

  it("refuses checkout with why over HTTP, when the referral stopped applying", async () => {
    await enable();
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(3000);
    await applyReferral(cookie, code);
    // the friend pays for another order elsewhere in between
    await db.query(
      "INSERT INTO orders (user_id, subtotal, shipping, total, email, shipping_address, expires_at, paid_at, status) VALUES ($1, 100, 0, 100, $2, '{}', now(), now(), 'paid')",
      [friend.id, friend.email],
    );
    const res = await http()
      .post("/api/v1/checkout")
      .set("Cookie", cookie)
      .send({ address: ADDRESS });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REFERRAL_NOT_FIRST_ORDER");
    expect((await getCart(cookie)).body.data).toMatchObject({
      referral: null,
      discount: 0,
      total: 3490,
    });
  });

  it("leaves custom prints out of the discount", async () => {
    await enable({ friend_kind: "percent", friend_value: 10 });
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(2000);
    const { variant, product } = await makeVariant(db, { price: 4000 });
    await makeCustom(product.id);
    await addToCart(db, friend.id, variant.id);
    const res = await applyReferral(cookie, code);
    expect(res.body.data).toMatchObject({ subtotal: 6000, discount: 200 });
    await enable({
      friend_kind: "percent",
      friend_value: 10,
      custom_prints: true,
    });
    expect((await getCart(cookie)).body.data.discount).toBe(600);
  });
});

describe("checkout with a referral", () => {
  it("charges the friend's discount and keeps the rule it was made under", async () => {
    await enable({ reward: 700, pay_after_days: 14 });
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(3000);
    await applyReferral(cookie, code);
    const order = await checkoutAndPay(friend.id);
    expect(order).toMatchObject({
      subtotal: 3000,
      discount: 500,
      coupon_code: null,
      total: 3000 - 500 + 490,
    });
    expect(payments.created[0]!.discount).toEqual({
      amount: 500,
      name: "Friend's discount",
    });
    // the admin's later change doesn't touch it
    await enable({ reward: 100, pay_after_days: 0 });
    expect(await referralRow(order.id)).toMatchObject({
      referrer_id: referrer.id,
      status: "pending",
      friend_kind: "amount",
      friend_value: 500,
      reward: 700,
      pay_after_days: 14,
      discount: 500,
    });
    // a first order is placed: the code leaves the bag
    expect((await getCart(cookie)).body.data.referral).toBeNull();
  });

  it("takes the better of a code and the referral, never both", async () => {
    await enable({ friend_value: 500 });
    await db.query(
      "INSERT INTO coupons (code, kind, value) VALUES ('TENOFF', 'percent', 10)",
    );
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(8000);
    await applyReferral(cookie, code);
    const res = await http()
      .put("/api/v1/cart/coupon")
      .set("Cookie", cookie)
      .send({ code: "TENOFF" });
    // 10% of €80 beats €5
    expect(res.body.data).toMatchObject({
      discount: 800,
      coupon: { discount: 800 },
      referral: { discount: 500, applied: false },
    });
    await enable({ friend_value: 1000 });
    expect((await getCart(cookie)).body.data).toMatchObject({
      discount: 1000,
      referral: { applied: true },
    });
    const order = await checkoutAndPay(friend.id);
    expect(order).toMatchObject({ discount: 1000, coupon_code: null });
    const { rows } = await db.query("SELECT * FROM coupon_redemptions");
    expect(rows).toEqual([]);
  });

  it("frees the friend again when the checkout is abandoned", async () => {
    await enable();
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag();
    await applyReferral(cookie, code);
    const { order_number } = await service.start(friend.id, {
      address: ADDRESS,
    });
    const first = await orderRow(order_number);
    // a new checkout replaces the first
    const second = await checkoutAndPay(friend.id);
    expect((await referralRow(first.id)).status).toBe("cancelled");
    expect((await referralRow(second.id)).status).toBe("pending");
  });
});

describe("payouts", () => {
  /** A paid, delivered referral order; resolves to the order. */
  async function referredOrder() {
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag(3000);
    await applyReferral(cookie, code);
    const order = await checkoutAndPay(friend.id);
    await deliver(order.number);
    return order;
  }

  it("pays the referrer pay_after_days after delivery", async () => {
    await enable({ reward: 700, pay_after_days: 30, credit_expiry_months: 12 });
    const order = await referredOrder();
    const now = Date.now();
    expect(await settleCredit(db, new Date(now + 29 * DAY))).toMatchObject({
      earned: 0,
    });
    expect((await referralRow(order.id)).status).toBe("pending");
    expect(await settleCredit(db, new Date(now + 31 * DAY))).toMatchObject({
      earned: 1,
    });
    expect((await referralRow(order.id)).status).toBe("earned");
    expect(await ledger(referrer.id)).toEqual([
      { kind: "earned", amount: 700 },
    ]);
    // again: nothing more
    expect(await settleCredit(db, new Date(now + 40 * DAY))).toMatchObject({
      earned: 0,
    });
    const res = await http()
      .get("/api/v1/account/referrals")
      .set("Cookie", referrerCookie);
    expect(res.body.data).toMatchObject({
      balance: 700,
      referrals: [{ status: "earned", reward: 700 }],
    });
  });

  it("waits for delivery, however long ago it was paid", async () => {
    await enable({ pay_after_days: 0 });
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag();
    await applyReferral(cookie, code);
    const order = await checkoutAndPay(friend.id);
    await settleCredit(db, new Date(Date.now() + 365 * DAY));
    expect((await referralRow(order.id)).status).toBe("pending");
  });

  it("cancels a referral whose order is refunded first", async () => {
    await enable({ pay_after_days: 30 });
    const order = await referredOrder();
    await service.refundPaid(order.number, false);
    expect((await referralRow(order.id)).status).toBe("cancelled");
    await settleCredit(db, new Date(Date.now() + 60 * DAY));
    expect(await ledger(referrer.id)).toEqual([]);
  });

  it("pays at most monthly_cap referrals a month", async () => {
    await enable({ pay_after_days: 0, monthly_cap: 1 });
    const a = await referredOrder();
    const b = await referredOrder();
    const now = new Date(Date.now() + DAY);
    expect(await settleCredit(db, now)).toMatchObject({ earned: 1, capped: 1 });
    expect((await referralRow(a.id)).status).toBe("earned");
    expect((await referralRow(b.id)).status).toBe("capped");
    expect(await ledger(referrer.id)).toEqual([
      { kind: "earned", amount: 500 },
    ]);
  });
});

describe("credit expiry", () => {
  const row = (
    id: string,
    amount: number,
    kind: string,
    at: number,
    expires: number | null = null,
    lot: string | null = null,
  ): LedgerRow => ({
    id,
    amount,
    kind,
    lot_id: lot,
    created_at: new Date(at),
    expires_at: expires === null ? null : new Date(expires),
  });

  it("spends the credit that lapses first", () => {
    const rows = [
      row("a", 500, "earned", 0, 100),
      row("b", 500, "earned", 1, 50),
      row("s", -600, "spent", 2),
    ];
    const { lots, balance } = creditLots(rows, new Date(10));
    expect(lots.map((l) => l.remaining)).toEqual([400, 0]);
    expect(balance).toBe(400);
    // b lapsed with nothing left, a with 400
    expect(creditLots(rows, new Date(100)).balance).toBe(0);
  });

  it("doesn't count credit that lapsed, expired by the job or not", () => {
    const rows = [
      row("a", 500, "earned", 0, 100),
      row("n", 300, "adjusted", 1),
    ];
    expect(creditLots(rows, new Date(200)).balance).toBe(300);
    rows.push(row("x", -500, "expired", 201, null, "a"));
    expect(creditLots(rows, new Date(300)).balance).toBe(300);
  });

  it("expires what's left, once", async () => {
    await enable({ pay_after_days: 0, reward: 1000, credit_expiry_months: 1 });
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag();
    await applyReferral(cookie, code);
    const order = await checkoutAndPay(friend.id);
    await deliver(order.number);
    const now = new Date();
    await settleCredit(db, now);
    // spend part of it
    await db.query(
      "INSERT INTO credit_ledger (user_id, amount, kind) VALUES ($1, -300, 'spent')",
      [referrer.id],
    );
    const later = new Date(expiryFrom(now, 1)!.getTime() + 1000);
    expect((await settleCredit(db, later)).expired).toBe(700);
    expect((await settleCredit(db, later)).expired).toBe(0);
    expect(await ledger(referrer.id)).toEqual([
      { kind: "earned", amount: 1000 },
      { kind: "spent", amount: -300 },
      { kind: "expired", amount: -700 },
    ]);
    expect((await loadCredit(db, referrer.id, later)).balance).toBe(0);
  });
});

describe("store credit at checkout", () => {
  it("caps credit at the store's share of the bill", () => {
    expect(creditCap(3490, 30)).toBe(1047);
    // never below Stripe's minimum charge
    expect(creditCap(100, 100)).toBe(50);
    expect(creditCap(40, 100)).toBe(0);
  });

  it("pays part of the order, spends it once paid, and gives it back on refund", async () => {
    await enable({ credit_max_percent: 30 });
    await grant(referrer.id, 2000);
    const { variant } = await makeVariant(db, { price: 3000 });
    await addToCart(db, referrer.id, variant.id);
    const credit = await http()
      .get("/api/v1/account/credit")
      .set("Cookie", referrerCookie);
    expect(credit.body.data).toEqual({
      balance: 2000,
      available: 2000,
      max_percent: 30,
    });

    const { order_number } = await service.start(referrer.id, {
      address: ADDRESS,
      use_credit: true,
    });
    let order = await orderRow(order_number);
    // 30% of €34.90
    expect(order).toMatchObject({ credit: 1047, total: 3490 - 1047 });
    expect(payments.created[0]!.discount).toEqual({
      amount: 1047,
      name: "Store credit",
    });
    // held, not spent, until paid
    expect(await ledger(referrer.id)).toHaveLength(1);
    expect(
      (await http().get("/api/v1/account/credit").set("Cookie", referrerCookie))
        .body.data,
    ).toMatchObject({ balance: 2000, available: 2000 - 1047 });

    payments.pay(order.stripe_session_id);
    await service.reconcile(order.stripe_session_id);
    order = await orderRow(order_number);
    expect(order.status).toBe("paid");
    expect((await ledger(referrer.id)).at(-1)).toEqual({
      kind: "spent",
      amount: -1047,
    });
    expect((await loadCredit(db, referrer.id, new Date())).balance).toBe(953);

    await service.refundPaid(order_number, false);
    expect((await ledger(referrer.id)).at(-1)).toEqual({
      kind: "reversed",
      amount: 1047,
    });
    expect((await loadCredit(db, referrer.id, new Date())).balance).toBe(2000);
  });

  it("uses no credit unless asked, and none a customer doesn't have", async () => {
    await enable();
    const { variant } = await makeVariant(db, { price: 3000 });
    await addToCart(db, referrer.id, variant.id);
    const { order_number } = await service.start(referrer.id, {
      address: ADDRESS,
      use_credit: true,
    });
    expect((await orderRow(order_number)).credit).toBe(0);
  });
});

describe("store credit at the counter", () => {
  const redeem = (userId: string, body: object) =>
    http()
      .post(`/api/v1/admin/credit/customers/${userId}/redemptions`)
      .set("Cookie", admin)
      .send(body);
  const confirmCode = (id: string, code: string) =>
    http()
      .post(`/api/v1/admin/credit/redemptions/${id}/confirm`)
      .set("Cookie", admin)
      .send({ code });

  it("finds customers and shows their ledger", async () => {
    await grant(referrer.id, 1500);
    const found = await http()
      .get("/api/v1/admin/credit/customers?q=rita")
      .set("Cookie", admin);
    expect(found.body.data).toEqual([
      {
        id: referrer.id,
        name: "Rita Referrer",
        email: referrer.email,
        balance: 1500,
      },
    ]);
    const account = await http()
      .get(`/api/v1/admin/credit/customers/${referrer.id}`)
      .set("Cookie", admin);
    expect(account.body.data).toMatchObject({
      balance: 1500,
      available: 1500,
      max_percent: 30,
      entries: [{ kind: "adjusted", amount: 1500, note: "Goodwill" }],
    });
  });

  it("adjusts only with a note, and never below what's free", async () => {
    const noNote = await http()
      .post(`/api/v1/admin/credit/customers/${referrer.id}/adjust`)
      .set("Cookie", admin)
      .send({ amount: 500, note: " " });
    expect(noNote.status).toBe(400);
    expect(noNote.body.errors[0]).toMatchObject({
      field: "note",
      message: "Say why, for the record",
    });
    await grant(referrer.id, 500);
    const res = await grant(referrer.id, -501);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CREDIT_NOT_ENOUGH");
    expect((await grant(referrer.id, -500)).body.data.balance).toBe(0);
  });

  it("needs mail to send the code", async () => {
    await grant(referrer.id, 1000);
    const res = await redeem(referrer.id, { bill: 5000, amount: 500 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("MAIL_UNAVAILABLE");
  });

  it("emails a code, and spends the credit once it's confirmed", async () => {
    const mailer = new FakeMailer();
    ctx.deps.mailer = mailer;
    await enable({ credit_max_percent: 30 });
    await grant(referrer.id, 2000);

    // 30% of a €40 bill is €12
    const over = await redeem(referrer.id, { bill: 4000, amount: 1201 });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("CREDIT_OVER_LIMIT");
    expect(mailer.sent).toEqual([]);

    const res = await redeem(referrer.id, { bill: 4000, amount: 1200 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: 1200, bill: 4000 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe(referrer.email);
    const code = /\b(\d{6})\b/.exec(mailer.sent[0]!.text)![1]!;
    const id = res.body.data.id as string;

    const wrong = await confirmCode(
      id,
      code === "000000" ? "111111" : "000000",
    );
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe("CREDIT_CODE_INVALID");
    // nothing spent yet
    expect((await loadCredit(db, referrer.id, new Date())).balance).toBe(2000);

    const ok = await confirmCode(id, code);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      balance: 800,
      entries: [
        { kind: "spent", amount: -1200, note: "In store, on a bill of €40.00" },
        { kind: "adjusted", amount: 2000 },
      ],
    });
    // a code works once
    const again = await confirmCode(id, code);
    expect(again.body.code).toBe("CREDIT_CODE_EXPIRED");
  });

  it("gives a code 5 tries", async () => {
    const mailer = new FakeMailer();
    ctx.deps.mailer = mailer;
    await grant(referrer.id, 2000);
    const res = await redeem(referrer.id, { bill: 4000, amount: 500 });
    const id = res.body.data.id as string;
    const code = /\b(\d{6})\b/.exec(mailer.sent[0]!.text)![1]!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect((await confirmCode(id, wrong)).body.code).toBe(
        "CREDIT_CODE_INVALID",
      );
    expect((await confirmCode(id, code)).body.code).toBe("CREDIT_CODE_EXPIRED");
  });

  it("refuses more than the customer has", async () => {
    ctx.deps.mailer = new FakeMailer();
    await grant(referrer.id, 300);
    const res = await redeem(referrer.id, { bill: 4000, amount: 500 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CREDIT_NOT_ENOUGH");
  });
});

describe("GET /admin/referrals", () => {
  it("lists who referred whom, with the order and its status", async () => {
    await enable();
    const code = await codeOf();
    const { friend, cookie } = await friendWithBag();
    await applyReferral(cookie, code);
    const order = await checkoutAndPay(friend.id);
    const res = await http()
      .get("/api/v1/admin/referrals")
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        status: "pending",
        referrer_id: referrer.id,
        referrer_name: "Rita Referrer",
        friend_email: friend.email,
        order_number: order.number,
        order_status: "paid",
        payout_at: null,
      }),
    ]);
    const earned = await http()
      .get("/api/v1/admin/referrals?status=earned")
      .set("Cookie", admin);
    expect(earned.body.data).toEqual([]);
    const bad = await http()
      .get("/api/v1/admin/referrals?status=nope")
      .set("Cookie", admin);
    expect(bad.status).toBe(400);
  });

  it("is for admins only", async () => {
    expect(
      (
        await http()
          .get("/api/v1/admin/referrals")
          .set("Cookie", referrerCookie)
      ).status,
    ).toBe(403);
  });
});
