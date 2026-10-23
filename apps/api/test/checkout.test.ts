import { beforeEach, describe, expect, it } from "vitest";
import { createAddress, getCartLines, type User } from "../src/db/gen";
import {
  ADDRESS,
  addToCart,
  eventBody,
  GOOD_SIGNATURE,
  makeVariant,
  setupCheckoutApp,
  stockOf,
} from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const { http, db, cfg, payments, service } = setupCheckoutApp();

let user: User;
let cookie = "";
beforeEach(async () => {
  payments.reset();
  service.now = () => new Date();
  user = await makeUser(db);
  cookie = cookieFor(cfg, user);
});

const checkout = (body: unknown, as = cookie) =>
  http()
    .post("/api/v1/checkout")
    .set("Cookie", as)
    .send(body as object);
const orderRow = async (number: number) =>
  (await db.query("SELECT * FROM orders WHERE number = $1", [number])).rows[0];
const outbox = async () =>
  (
    await db.query(
      "SELECT kind, order_id FROM email_outbox ORDER BY created_at",
    )
  ).rows;

describe("POST /checkout: refused before any work", () => {
  const cases: [string, unknown, string, number][] = [
    ["neither address", {}, "VALIDATION_FAILED", 400],
    [
      "both addresses",
      { address_id: "0f6ada99-b884-4c07-88d4-7843a41cdda8", address: ADDRESS },
      "VALIDATION_FAILED",
      400,
    ],
    [
      "unshipped country",
      { address: { ...ADDRESS, country: "ZZ" } },
      "VALIDATION_FAILED",
      400,
    ],
    ["bad address id", { address_id: "nope" }, "VALIDATION_FAILED", 400],
  ];
  it.each(cases)("%s", async (_name, body, code, status) => {
    const res = await checkout(body);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it("needs a signed-in user", async () => {
    const res = await http()
      .post("/api/v1/checkout")
      .send({ address: ADDRESS });
    expect(res.status).toBe(401);
  });

  it("says which address rule failed, as Go did", async () => {
    let res = await checkout({});
    expect(res.body).toEqual({
      success: false,
      message: "Give either address_id or address",
      code: "VALIDATION_FAILED",
    });

    res = await checkout({ address_id: "nope" });
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_UUID",
        field: "address_id",
        message: "Address id must be a valid ID",
      },
    ]);

    res = await checkout({
      address: { ...ADDRESS, full_name: "   ", phone: "", country: "" },
    });
    expect(res.body.errors).toEqual([
      {
        code: "BLANK_FIELD",
        field: "address.full_name",
        message: "Full name cannot be blank",
      },
      {
        code: "REQUIRED_FIELD",
        field: "address.phone",
        message: "Phone is required",
      },
      {
        code: "REQUIRED_FIELD",
        field: "address.country",
        message: "Country is required",
      },
    ]);

    res = await checkout({
      address: {
        ...ADDRESS,
        phone: "123",
        line2: "x".repeat(121),
        country: "ZZ",
      },
    });
    expect(res.body.errors).toEqual([
      {
        code: "TOO_SHORT",
        field: "address.phone",
        message: "Phone must be at least 6 characters",
      },
      {
        code: "TOO_LONG",
        field: "address.line2",
        message: "Line2 cannot exceed 120 characters",
      },
      {
        code: "INVALID_VALUE",
        field: "address.country",
        message:
          "Country must be one of: FI, US, CA, GB, IE, DE, FR, NL, AU, NZ, NP, IN, JP",
      },
    ]);
  });

  it("takes any hex UUID as an address id (then 404s)", async () => {
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    const res = await checkout({
      address_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "ADDRESS_NOT_FOUND",
      message: "Address not found",
    });
  });

  it("refuses an empty bag", async () => {
    const res = await checkout({ address: ADDRESS });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Your bag is empty",
      code: "CART_EMPTY",
    });
  });

  it("refuses a bag with more than is in stock", async () => {
    const { variant } = await makeVariant(db, { stock: 1 });
    await addToCart(db, user.id, variant.id, 2);
    const res = await checkout({ address: ADDRESS });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "CART_HAS_ISSUES",
      message: "Some items in your bag need attention before checkout",
    });
    expect(await stockOf(db, variant.id)).toBe(1);
    expect(
      (await db.query("SELECT count(*)::int AS n FROM orders")).rows[0].n,
    ).toBe(0);
  });
});

describe("POST /checkout", () => {
  it("reserves the stock in a pending order and opens a Stripe page", async () => {
    const tee = await makeVariant(db, {
      name: "Tee",
      price: 2500,
      stock: 5,
      options: [
        ["color", "Black"],
        ["size", "M"],
      ],
      image: "https://img/tee.jpg",
    });
    const mug = await makeVariant(db, { name: "Mug", price: 1200, stock: 3 });
    await addToCart(db, user.id, tee.variant.id, 2);
    await addToCart(db, user.id, mug.variant.id, 1);

    const res = await checkout({
      address: { ...ADDRESS, full_name: "  Ada   Lovelace " },
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: "Checkout started",
      data: {
        order_number: 1001,
        checkout_url: "https://checkout.stripe.test/cs_test_1",
      },
    });

    const order = await orderRow(1001);
    expect(order).toMatchObject({
      status: "pending",
      subtotal: 6200,
      shipping: 0,
      total: 6200,
      currency: "eur",
      email: user.email,
      stripe_session_id: "cs_test_1",
      shipping_address: {
        full_name: "Ada Lovelace",
        phone: "5550100",
        line1: "1 Main St",
        line2: "",
        city: "London",
        region: "",
        postal_code: "SW1A 1AA",
        country: "GB",
      },
    });
    expect(await stockOf(db, tee.variant.id)).toBe(3);
    expect(await stockOf(db, mug.variant.id)).toBe(2);
    // The cart stays until payment.
    expect(await getCartLines(db, user.id)).toHaveLength(2);

    const req = payments.created[0]!;
    expect(req).toMatchObject({
      orderId: order.id,
      orderNumber: 1001,
      email: user.email,
      currency: "eur",
      shipping: 0,
      successUrl:
        "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "http://localhost:3000/cart?checkout=cancelled",
    });
    expect(req.expiresAt.getTime()).toBe(order.expires_at.getTime());
    expect(req.expiresAt.getTime() - Date.now()).toBeGreaterThan(30 * 60_000);
    expect(req.items).toEqual(
      expect.arrayContaining([
        {
          name: "Tee (Black / M)",
          image: "https://img/tee.jpg",
          unitAmount: 2500,
          quantity: 2,
        },
        { name: "Mug", image: "", unitAmount: 1200, quantity: 1 },
      ]),
    );

    const items = (
      await db.query(
        "SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name",
        [order.id],
      )
    ).rows;
    expect(items[0]).toMatchObject({
      product_name: "Mug",
      unit_price: 1200,
      quantity: 1,
      line_total: 1200,
      options: [],
    });
    expect(items[1]).toMatchObject({
      product_name: "Tee",
      line_total: 5000,
      image: "https://img/tee.jpg",
      options: [
        { name: "color", value: "Black", type: "text" },
        { name: "size", value: "M", type: "text" },
      ],
    });
  });

  it("charges flat shipping below the free threshold", async () => {
    const { variant } = await makeVariant(db, { price: 5999 });
    await addToCart(db, user.id, variant.id);
    expect((await checkout({ address: ADDRESS })).status).toBe(201);
    expect(await orderRow(1001)).toMatchObject({
      subtotal: 5999,
      shipping: 490,
      total: 6489,
    });
    expect(payments.created[0]!.shipping).toBe(490);
  });

  it("ships to a saved address", async () => {
    const saved = await createAddress(db, {
      user_id: user.id,
      full_name: "Grace Hopper",
      phone: "5550199",
      line1: "2 Navy Rd",
      line2: "Apt 3",
      city: "Arlington",
      region: "VA",
      postal_code: "22201",
      country: "US",
      is_default: false,
    });
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    const res = await checkout({
      address_id: saved!.id.toUpperCase(),
      save_address: true,
    });
    expect(res.status).toBe(201);
    expect((await orderRow(1001)).shipping_address).toEqual({
      full_name: "Grace Hopper",
      phone: "5550199",
      line1: "2 Navy Rd",
      line2: "Apt 3",
      city: "Arlington",
      region: "VA",
      postal_code: "22201",
      country: "US",
    });
    expect(
      (await db.query("SELECT count(*)::int AS n FROM addresses")).rows[0].n,
    ).toBe(1);
  });

  it("refuses another user's saved address", async () => {
    const other = await makeUser(db);
    const saved = await createAddress(db, {
      user_id: other.id,
      full_name: "X",
      phone: "5550100",
      line1: "1",
      line2: null,
      city: "Y",
      region: null,
      postal_code: "1",
      country: "GB",
      is_default: false,
    });
    const { variant } = await makeVariant(db, { stock: 4 });
    await addToCart(db, user.id, variant.id);
    const res = await checkout({ address_id: saved!.id });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ADDRESS_NOT_FOUND");
    expect(await stockOf(db, variant.id)).toBe(4);
  });

  it("saves a new address only when asked, as the default when asked", async () => {
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    await checkout({ address: ADDRESS });
    expect(
      (await db.query("SELECT count(*)::int AS n FROM addresses")).rows[0].n,
    ).toBe(0);

    await checkout({ address: ADDRESS, save_address: true });
    await checkout({
      address: { ...ADDRESS, line1: "2 Main St", line2: "  " },
      save_address: true,
      make_default: true,
    });
    const book = (
      await db.query(
        "SELECT line1, line2, region, postal_code, is_default FROM addresses ORDER BY created_at",
      )
    ).rows;
    expect(book).toEqual([
      {
        line1: "1 Main St",
        line2: null,
        region: null,
        postal_code: "SW1A 1AA",
        is_default: false,
      },
      {
        line1: "2 Main St",
        line2: null,
        region: null,
        postal_code: "SW1A 1AA",
        is_default: true,
      },
    ]);

    await checkout({
      address: { ...ADDRESS, line1: "3 Main St" },
      save_address: true,
      make_default: true,
    });
    const defaults = (
      await db.query("SELECT line1 FROM addresses WHERE is_default")
    ).rows;
    expect(defaults).toEqual([{ line1: "3 Main St" }]);
  });

  it("stops saving at the address book's limit, and still checks out", async () => {
    for (let i = 0; i < 10; i++) {
      await createAddress(db, {
        user_id: user.id,
        full_name: "A",
        phone: "5550100",
        line1: `${i}`,
        line2: null,
        city: "C",
        region: null,
        postal_code: "1",
        country: "GB",
        is_default: false,
      });
    }
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    const res = await checkout({
      address: ADDRESS,
      save_address: true,
      make_default: true,
    });
    expect(res.status).toBe(201);
    expect(
      (await db.query("SELECT count(*)::int AS n FROM addresses")).rows[0].n,
    ).toBe(10);
  });

  it("replaces the user's unpaid checkout and its hold", async () => {
    const { variant } = await makeVariant(db, { stock: 5 });
    await addToCart(db, user.id, variant.id, 2);
    await checkout({ address: ADDRESS });
    expect(await stockOf(db, variant.id)).toBe(3);

    const res = await checkout({ address: ADDRESS });
    expect(res.body.data.order_number).toBe(1002);
    expect(await stockOf(db, variant.id)).toBe(3);
    expect((await orderRow(1001)).status).toBe("cancelled");
    expect(payments.expired).toEqual(["cs_test_1"]);
  });

  it("answers 502 and returns the stock when Stripe can't be reached", async () => {
    const { variant } = await makeVariant(db, { stock: 5 });
    await addToCart(db, user.id, variant.id, 2);
    payments.failCreate = true;
    const res = await checkout({ address: ADDRESS });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      success: false,
      message:
        "We couldn't reach the payment provider. Your bag is unchanged; try again.",
      code: "PAYMENT_PROVIDER_ERROR",
    });
    expect(await stockOf(db, variant.id)).toBe(5);
    expect((await orderRow(1001)).status).toBe("cancelled");
  });

  it("first releases other reservations that ran out", async () => {
    const { variant } = await makeVariant(db, { stock: 2 });
    const other = await makeUser(db);
    await addToCart(db, other.id, variant.id, 2);
    service.now = () => new Date(Date.now() - 60 * 60_000);
    await service.start(other.id, { address: ADDRESS });
    service.now = () => new Date();
    expect(await stockOf(db, variant.id)).toBe(0);

    await addToCart(db, user.id, variant.id, 1);
    expect((await checkout({ address: ADDRESS })).status).toBe(201);
    expect(await stockOf(db, variant.id)).toBe(1);
  });
});

describe("POST /webhooks/stripe", () => {
  const webhook = (body: string, signature = GOOD_SIGNATURE) =>
    http()
      .post("/api/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(body);

  async function started(quantity = 2, stock = 5) {
    const { variant } = await makeVariant(db, { stock, price: 2500 });
    await addToCart(db, user.id, variant.id, quantity);
    const res = await checkout({ address: ADDRESS });
    const order = await orderRow(res.body.data.order_number);
    return { variant, order, sessionId: order.stripe_session_id as string };
  }

  it("refuses an unsigned event", async () => {
    const res = await webhook("{}", "bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid webhook signature",
      code: "INVALID_WEBHOOK_SIGNATURE",
    });
  });

  it("refuses an unsigned event of another content type", async () => {
    const res = await http()
      .post("/api/v1/webhooks/stripe")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("acknowledges events it doesn't act on", async () => {
    const res = await webhook(
      eventBody({ type: "payment_intent.created", kind: "other" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Event received" });
    expect(
      (await db.query("SELECT count(*)::int AS n FROM stripe_events")).rows[0]
        .n,
    ).toBe(0);
  });

  it("marks the order paid once, records the payment, clears the bought lines and queues the email", async () => {
    const { order, sessionId } = await started();
    const session = { ...payments.pay(sessionId, "pi_1") };
    const body = eventBody({ id: "evt_1", session });
    expect((await webhook(body)).status).toBe(200);
    expect((await webhook(body)).status).toBe(200); // a duplicate is skipped

    const paid = await orderRow(order.number);
    expect(paid.status).toBe("paid");
    expect(paid.paid_at).not.toBeNull();
    const pays = (
      await db.query(
        "SELECT stripe_session_id, stripe_payment_intent_id, amount, currency FROM payments",
      )
    ).rows;
    expect(pays).toEqual([
      {
        stripe_session_id: sessionId,
        stripe_payment_intent_id: "pi_1",
        amount: 5490,
        currency: "eur",
      },
    ]);
    expect(await getCartLines(db, user.id)).toEqual([]);
    expect(await outbox()).toEqual([
      { kind: "order_confirmed", order_id: order.id },
    ]);
  });

  it("waits for a delayed payment, then fulfils on async_payment_succeeded", async () => {
    const { order, sessionId } = await started();
    const unpaid = payments.sessions.get(sessionId)!;
    expect((await webhook(eventBody({ session: unpaid }))).status).toBe(200);
    expect((await orderRow(order.number)).status).toBe("pending");

    const session = payments.pay(sessionId);
    await webhook(
      eventBody({
        type: "checkout.session.async_payment_succeeded",
        kind: "paid",
        session,
      }),
    );
    expect((await orderRow(order.number)).status).toBe("paid");
  });

  it.each([
    ["checkout.session.expired", "expired"],
    ["checkout.session.async_payment_failed", "failed"],
  ] as const)("releases the order on %s", async (type, kind) => {
    const { order, variant, sessionId } = await started();
    expect(await stockOf(db, variant.id)).toBe(3);
    const res = await webhook(
      eventBody({ type, kind, session: payments.sessions.get(sessionId)! }),
    );
    expect(res.status).toBe(200);
    expect((await orderRow(order.number)).status).toBe("cancelled");
    expect(await stockOf(db, variant.id)).toBe(5);
  });

  it("ignores an expiry without an order id", async () => {
    const res = await webhook(
      eventBody({
        type: "checkout.session.expired",
        kind: "expired",
        session: { id: "cs_x" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("takes the stock back for an order paid after it was released, recording what's short", async () => {
    const { order, variant, sessionId } = await started(2, 2);
    await service.release(order.id);
    expect(await stockOf(db, variant.id)).toBe(2);
    // Someone else buys one meanwhile.
    await db.query("UPDATE product_variants SET stock = 1 WHERE id = $1", [
      variant.id,
    ]);

    await webhook(eventBody({ session: payments.pay(sessionId) }));
    expect((await orderRow(order.number)).status).toBe("paid");
    expect(await stockOf(db, variant.id)).toBe(0);
    const { rows } = await db.query(
      "SELECT stock_shortfall FROM order_items WHERE order_id = $1",
      [order.id],
    );
    expect(rows).toEqual([{ stock_shortfall: 1 }]);
  });
});

describe("GET /checkout/sessions/:sessionID", () => {
  const view = (id: string, as = cookie) =>
    http().get(`/api/v1/checkout/sessions/${id}`).set("Cookie", as);

  it("refuses what isn't a session id", async () => {
    let res = await view("pi_123");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid checkout session ID",
      code: "INVALID_SESSION_ID",
    });
    res = await view("cs_" + "x".repeat(253));
    expect(res.status).toBe(400);
  });

  it("is the user's own order only", async () => {
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    await checkout({ address: ADDRESS });
    const other = await makeUser(db);
    const res = await view("cs_test_1", cookieFor(cfg, other));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Order not found",
      code: "ORDER_NOT_FOUND",
    });
  });

  it("settles a paid session before answering, even without the webhook", async () => {
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    await checkout({ address: ADDRESS });
    payments.pay("cs_test_1");
    const res = await view("cs_test_1");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order fetched");
    expect(res.body.data).toMatchObject({
      number: 1001,
      status: "paid",
      stripe_session_id: "cs_test_1",
    });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.reviewed_product_ids).toEqual([]);
  });

  it("releases an expired session, and answers with what it knows when Stripe fails", async () => {
    const { variant } = await makeVariant(db, { stock: 3 });
    await addToCart(db, user.id, variant.id);
    await checkout({ address: ADDRESS });

    payments.failGet = true;
    let res = await view("cs_test_1");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("pending");

    payments.failGet = false;
    payments.sessions.get("cs_test_1")!.expired = true;
    res = await view("cs_test_1");
    expect(res.body.data.status).toBe("cancelled");
    expect(await stockOf(db, variant.id)).toBe(3);
  });
});

describe("CheckoutService", () => {
  it("releases expired reservations after the grace period", async () => {
    const { variant } = await makeVariant(db, { stock: 3 });
    await addToCart(db, user.id, variant.id, 3);
    await service.start(user.id, { address: ADDRESS });
    expect(await service.releaseExpired()).toBe(0);

    // The page expires after 31 minutes; the sweeper waits 5 more.
    service.now = () => new Date(Date.now() + 35 * 60_000);
    expect(await service.releaseExpired()).toBe(0);
    service.now = () => new Date(Date.now() + 37 * 60_000);
    expect(await service.releaseExpired()).toBe(1);
    expect(await stockOf(db, variant.id)).toBe(3);
    expect(await service.releaseExpired()).toBe(0);
  });

  it("builds the hosted page's lines with their options", async () => {
    const { variant } = await makeVariant(db, {
      name: "Mug",
      options: [["glaze", "Rust"]],
    });
    await addToCart(db, user.id, variant.id);
    await service.start(user.id, { address: ADDRESS });
    expect(payments.created[0]!.items[0]!.name).toBe("Mug (Rust)");
  });

  it("is enabled only with a provider", async () => {
    const { CheckoutService } = await import("../src/checkout/service");
    expect(new CheckoutService(db, null, "").enabled()).toBe(false);
    expect(service.enabled()).toBe(true);
  });
});
