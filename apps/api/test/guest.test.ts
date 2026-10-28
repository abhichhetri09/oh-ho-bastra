import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  getEmailOrder,
  type Coupon,
  type User,
} from "../src/db/gen";
import { cleanUp } from "../src/jobs";
import { MAX_CART_LINES, MAX_LINE, mergedQuantity } from "../src/shopping/cart";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
} from "./checkout-helpers";
import {
  cookieFor,
  makeGuest,
  makeUser,
  setupTestApp,
  signIn,
  testConfig,
  TEST_PASSWORD,
} from "./helpers";

// Guest checkout: guest sessions, what a guest may do, its checkout (the
// email it gives), handing a guest's bag and orders to the account it
// signs in to, finding an order by number and email, and the cleanup.

const ctx = setupCheckoutApp();
const { http, db, cfg, payments, service } = ctx;

beforeEach(() => {
  payments.reset();
  service.now = () => new Date();
});

const DAY = 24 * 60 * 60_000;

/** "name=value; …" of the cookies a response sets (cleared ones left out). */
function cookieHeader(res: Response): string {
  const raw = res.headers["set-cookie"] as unknown;
  const lines = Array.isArray(raw) ? (raw as string[]) : [];
  return lines
    .map((line) => line.split(";", 1)[0]!)
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** A guest session, as the web starts one: the guest and its cookies. */
async function startGuest() {
  const res = await http().post("/api/v1/auth/guest");
  expect(res.status).toBe(201);
  const { rows } = await db.query<User>("SELECT * FROM users WHERE id = $1", [
    res.body.data.id,
  ]);
  return { guest: rows[0]!, cookie: cookieHeader(res) };
}

const count = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0].n as number;
const userExists = async (id: string) =>
  (await count("SELECT count(*)::int AS n FROM users WHERE id = $1", [id])) ===
  1;
const orderRow = async (number: number) =>
  (await db.query("SELECT * FROM orders WHERE number = $1", [number])).rows[0];
const cartOf = async (userId: string) =>
  (
    await db.query(
      `SELECT ci.variant_id, ci.quantity FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id
       WHERE c.user_id = $1 ORDER BY ci.variant_id`,
      [userId],
    )
  ).rows as { variant_id: string; quantity: number }[];
const cartCode = async (userId: string) =>
  (await db.query("SELECT coupon_code FROM carts WHERE user_id = $1", [userId]))
    .rows[0]?.coupon_code ?? null;
const setCartCode = (userId: string, code: string) =>
  db.query(
    `INSERT INTO carts (user_id, coupon_code) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET coupon_code = EXCLUDED.coupon_code`,
    [userId, code],
  );

/** A live coupon (percent 10 unless told otherwise). */
async function makeCoupon(
  fields: Partial<Pick<Coupon, "code" | "once_per_customer">> = {},
): Promise<Coupon> {
  const { rows } = await db.query<Coupon>(
    `INSERT INTO coupons (code, kind, value, once_per_customer)
     VALUES ($1, 'percent', 10, $2) RETURNING *`,
    [fields.code ?? "SUMMER10", fields.once_per_customer ?? false],
  );
  return rows[0]!;
}

const checkout = (cookie: string, body: Record<string, unknown>) =>
  http().post("/api/v1/checkout").set("Cookie", cookie).send(body);

/** Pays an order's Stripe page and settles it, as the success page does. */
async function pay(number: number) {
  const order = await orderRow(number);
  payments.pay(order.stripe_session_id);
  await service.reconcile(order.stripe_session_id);
}

/** A paid order of one new variant by a user (a guest gives email). */
async function order(userId: string, email?: string, paid = true) {
  const { variant } = await makeVariant(db);
  await addToCart(db, userId, variant.id);
  const { order_number } = await service.start(userId, {
    email,
    address: ADDRESS,
  });
  if (paid) await pay(order_number);
  return order_number;
}

describe("POST /auth/guest", () => {
  it("creates a guest and starts its session", async () => {
    const res = await http().post("/api/v1/auth/guest");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: "Guest session started",
      data: {
        id: expect.any(String),
        name: "Guest",
        email: null,
        role: "guest",
        image_url: null,
      },
    });
    const cookie = cookieHeader(res);
    expect(cookie).toMatch(/access_token=/);
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/is_logged_in=true/);
    const row = (
      await db.query("SELECT * FROM users WHERE id = $1", [res.body.data.id])
    ).rows[0];
    expect(row).toMatchObject({
      role: "guest",
      email: null,
      password_hash: "",
    });
    expect(
      await count(
        "SELECT count(*)::int AS n FROM sessions WHERE user_id = $1",
        [row.id],
      ),
    ).toBe(1);

    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ role: "guest", email: null });
  });

  it("gives a request that has a session its user back", async () => {
    const { guest, cookie } = await startGuest();
    const again = await http().post("/api/v1/auth/guest").set("Cookie", cookie);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(guest.id);
    expect(again.headers["set-cookie"]).toBeUndefined();

    const user = await makeUser(db);
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    const signedIn = await http()
      .post("/api/v1/auth/guest")
      .set("Cookie", cookieHeader(login));
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data).toMatchObject({
      id: user.id,
      role: "customer",
    });
    expect(
      await count("SELECT count(*)::int AS n FROM users WHERE role = 'guest'"),
    ).toBe(1);
  });

  it("starts a new guest for a revoked or replayed session", async () => {
    const { guest, cookie } = await startGuest();
    await http().post("/api/v1/auth/logout").set("Cookie", cookie);
    const res = await http().post("/api/v1/auth/guest").set("Cookie", cookie);
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(guest.id);
  });
});

describe("what a guest may do", () => {
  let cookie = "";
  beforeEach(async () => {
    cookie = cookieFor(cfg, await makeGuest(db));
  });

  const product = "0f6ada99-b884-4c07-88d4-7843a41cdda8";
  const refused: [string, string, object?][] = [
    ["GET", "/wishlist"],
    ["GET", "/wishlist/ids"],
    ["PUT", `/wishlist/${product}`],
    ["DELETE", `/wishlist/${product}`],
    ["GET", "/products/tee/reviews/mine"],
    ["PUT", "/products/tee/reviews", { rating: 5, title: "Nice", body: "x" }],
    ["DELETE", "/products/tee/reviews"],
    ["GET", "/addresses"],
    ["DELETE", `/addresses/${product}`],
    ["PUT", `/addresses/${product}/default`],
    ["PATCH", "/auth/me", { name: "Ada" }],
    [
      "POST",
      "/auth/me/password",
      { current_password: "x", new_password: "12345678" },
    ],
  ];
  it.each(refused)("%s %s is for accounts", async (method, path, body) => {
    const req = http()
      [method.toLowerCase() as "get"](`/api/v1${path}`)
      .set("Cookie", cookie);
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      code: "GUEST_NOT_ALLOWED",
      message: "Sign in or create an account to do this",
    });
  });

  it("is not an admin", async () => {
    const res = await http().get("/api/v1/admin/orders").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("uses the bag, a code and its own orders", async () => {
    const { variant } = await makeVariant(db);
    await makeCoupon();
    const add = await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: variant.id, quantity: 2 });
    expect(add.status).toBe(200);
    expect(add.body.data.item_count).toBe(2);
    const code = await http()
      .put("/api/v1/cart/coupon")
      .set("Cookie", cookie)
      .send({ code: "summer10" });
    expect(code.status).toBe(200);
    expect(code.body.data.discount).toBe(500);
    const orders = await http().get("/api/v1/orders").set("Cookie", cookie);
    expect(orders.status).toBe(200);
    expect(orders.body.data).toEqual([]);
  });

  it("can never log in: it has no email or password", async () => {
    await makeGuest(db);
    for (const email of ["guest@example.com", "Guest"]) {
      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email, password: "" });
      expect(res.status).toBe(400);
    }
    const res = await http()
      .post("/api/v1/auth/login")
      .send({ email: "guest@example.com", password: "anything" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("is the only user without an email", async () => {
    await expect(
      db.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ('X', NULL, '', 'customer')",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("POST /checkout as a guest", () => {
  let guest: User;
  let cookie = "";
  beforeEach(async () => {
    guest = await makeGuest(db);
    cookie = cookieFor(cfg, guest);
    const { variant } = await makeVariant(db, { price: 3000 });
    await addToCart(db, guest.id, variant.id);
  });

  it("needs an email", async () => {
    const res = await checkout(cookie, { address: ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "REQUIRED_FIELD",
          field: "email",
          message: "Email is required",
        },
      ],
    });
    expect(payments.created).toHaveLength(0);
  });

  it("checks the email as registration does", async () => {
    const res = await checkout(cookie, {
      email: "not-an-email",
      address: ADDRESS,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_EMAIL",
        field: "email",
        message: "Enter a valid email address",
      },
    ]);
  });

  it("can't ship to a saved address", async () => {
    const res = await checkout(cookie, {
      email: "ada@example.com",
      address_id: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_VALUE",
        field: "address_id",
        message: "Enter the address to ship to",
      },
    ]);
  });

  it("orders with the email it gives, and saves no address", async () => {
    const res = await checkout(cookie, {
      email: "  Ada@Example.COM ",
      address: ADDRESS,
      save_address: true,
      make_default: true,
    });
    expect(res.status).toBe(201);
    const row = await orderRow(res.body.data.order_number);
    expect(row.email).toBe("ada@example.com");
    expect(row.user_id).toBe(guest.id);
    expect(payments.created[0]!.email).toBe("ada@example.com");
    expect(await count("SELECT count(*)::int AS n FROM addresses", [])).toBe(0);
  });

  it("emails the order's address, linking to the tracking page", async () => {
    const number = await order(guest.id, "ada@example.com");
    const row = await orderRow(number);
    const email = await getEmailOrder(db, row.id);
    expect(email).toMatchObject({ guest: true, customer_name: "Guest" });
    expect(email!.order.email).toBe("ada@example.com");
    expect(
      (await db.query("SELECT kind FROM email_outbox")).rows.map((r) => r.kind),
    ).toEqual(["order_confirmed"]);
  });

  it("ignores an email from an account", async () => {
    const user = await makeUser(db, { email: "grace@example.com" });
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    const res = await checkout(cookieFor(cfg, user), {
      email: "someone-else@example.com",
      address: ADDRESS,
    });
    expect(res.status).toBe(201);
    expect((await orderRow(res.body.data.order_number)).email).toBe(
      "grace@example.com",
    );
    expect(payments.created[0]!.email).toBe("grace@example.com");
  });
});

describe("a once-per-customer code at a guest's checkout", () => {
  beforeEach(async () => {
    await makeCoupon({ once_per_customer: true });
  });

  /** A guest with a bag and the code on it; resolves to its cookie. */
  async function guestBag() {
    const guest = await makeGuest(db);
    const { variant } = await makeVariant(db);
    await addToCart(db, guest.id, variant.id);
    await setCartCode(guest.id, "SUMMER10");
    return { guest, cookie: cookieFor(cfg, guest) };
  }

  it("counts the checkout email: the same email twice is refused", async () => {
    const first = await guestBag();
    const ok = await checkout(first.cookie, {
      email: "ada@example.com",
      address: ADDRESS,
    });
    expect(ok.status).toBe(201);
    const row = await orderRow(ok.body.data.order_number);
    expect(row.discount).toBe(250);
    const redemption = (
      await db.query(
        "SELECT email FROM coupon_redemptions WHERE order_id = $1",
        [row.id],
      )
    ).rows[0];
    expect(redemption.email).toBe("ada@example.com");
    await pay(ok.body.data.order_number);

    // the same guest again (paying took the code off its bag), and
    // another guest, with that email
    const { variant } = await makeVariant(db);
    await addToCart(db, first.guest.id, variant.id);
    await setCartCode(first.guest.id, "SUMMER10");
    for (const { cookie } of [first, await guestBag()]) {
      const res = await checkout(cookie, {
        email: "ADA@example.com",
        address: ADDRESS,
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COUPON_ALREADY_USED");
    }

    const other = await checkout((await guestBag()).cookie, {
      email: "grace@example.com",
      address: ADDRESS,
    });
    expect(other.status).toBe(201);
  });

  it("shares one use between a customer and a guest with one email", async () => {
    const user = await makeUser(db, { email: "ada@example.com" });
    const { variant } = await makeVariant(db);
    await addToCart(db, user.id, variant.id);
    await setCartCode(user.id, "SUMMER10");
    expect(
      (await checkout(cookieFor(cfg, user), { address: ADDRESS })).status,
    ).toBe(201);

    const { cookie } = await guestBag();
    const res = await checkout(cookie, {
      email: "ada@example.com",
      address: ADDRESS,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COUPON_ALREADY_USED");
  });

  it("lets a guest's bag show the code until checkout knows the email", async () => {
    const first = await guestBag();
    const used = await checkout(first.cookie, {
      email: "ada@example.com",
      address: ADDRESS,
    });
    await pay(used.body.data.order_number);
    const { cookie } = await guestBag();
    const cart = await http().get("/api/v1/cart").set("Cookie", cookie);
    expect(cart.body.data.coupon).toMatchObject({ discount: 250, issue: null });
  });
});

describe("signing in from a guest session", () => {
  const login = (cookie: string, email: string) =>
    http()
      .post("/api/v1/auth/login")
      .set("Cookie", cookie)
      .send({ email, password: TEST_PASSWORD });

  it("merges the bags, capped to stock, and keeps the account's code", async () => {
    const user = await makeUser(db, { email: "ada@example.com" });
    const { guest, cookie } = await startGuest();
    const shared = (await makeVariant(db, { stock: 5 })).variant;
    const guestOnly = (await makeVariant(db, { stock: 10 })).variant;
    const soldOut = (await makeVariant(db, { stock: 0 })).variant;
    const accountOnly = (await makeVariant(db)).variant;
    await addToCart(db, user.id, shared.id, 3);
    await addToCart(db, user.id, accountOnly.id, 1);
    await addToCart(db, guest.id, shared.id, 4);
    await addToCart(db, guest.id, guestOnly.id, 2);
    await addToCart(db, guest.id, soldOut.id, 1);
    await setCartCode(user.id, "MINE");
    await setCartCode(guest.id, "THEIRS");

    const res = await login(cookie, user.email);
    expect(res.status).toBe(200);

    const merged = new Map(
      (await cartOf(user.id)).map((l) => [l.variant_id, l.quantity]),
    );
    expect(merged).toEqual(
      new Map([
        [shared.id, 5], // 3 + 4, capped to the 5 in stock
        [accountOnly.id, 1],
        [guestOnly.id, 2],
      ]),
    );
    expect(await cartCode(user.id)).toBe("MINE");
    // a guest without orders is gone, its cart and sessions with it
    expect(await userExists(guest.id)).toBe(false);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM sessions WHERE user_id = $1",
        [guest.id],
      ),
    ).toBe(0);
    // the old guest cookies don't work any more
    const refreshed = await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);
    expect(refreshed.status).toBe(401);
  });

  it("takes the guest's code when the account has none", async () => {
    const user = await makeUser(db);
    const { guest, cookie } = await startGuest();
    await setCartCode(guest.id, "THEIRS");
    expect((await login(cookie, user.email)).status).toBe(200);
    expect(await cartCode(user.id)).toBe("THEIRS");
  });

  it("moves the orders placed with the account's email, and keeps the guest for the rest", async () => {
    const user = await makeUser(db, { email: "ada@example.com" });
    const { guest, cookie } = await startGuest();
    const mine = await order(guest.id, "Ada@Example.com");
    const theirs = await order(guest.id, "grace@example.com");

    expect((await login(cookie, user.email)).status).toBe(200);
    expect((await orderRow(mine)).user_id).toBe(user.id);
    expect((await orderRow(theirs)).user_id).toBe(guest.id);
    expect(await userExists(guest.id)).toBe(true);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL",
        [guest.id],
      ),
    ).toBe(0);

    const orders = await http()
      .get("/api/v1/orders")
      .set("Cookie", cookieFor(cfg, user));
    expect(orders.body.data.map((o: { number: number }) => o.number)).toEqual([
      mine,
    ]);
  });

  it("deletes the guest once all its orders moved", async () => {
    const user = await makeUser(db, { email: "ada@example.com" });
    const { guest, cookie } = await startGuest();
    const number = await order(guest.id, "ada@example.com");
    expect((await login(cookie, user.email)).status).toBe(200);
    expect((await orderRow(number)).user_id).toBe(user.id);
    expect(await userExists(guest.id)).toBe(false);
  });

  it("changes nothing from a customer's session, or a failed login", async () => {
    const user = await makeUser(db);
    const other = await makeUser(db);
    const { variant } = await makeVariant(db);
    await addToCart(db, other.id, variant.id, 2);
    const first = await http()
      .post("/api/v1/auth/login")
      .send({ email: other.email, password: TEST_PASSWORD });
    expect((await login(cookieHeader(first), user.email)).status).toBe(200);
    expect(await cartOf(user.id)).toEqual([]);
    expect(await cartOf(other.id)).toHaveLength(1);

    const { guest, cookie } = await startGuest();
    await addToCart(db, guest.id, variant.id, 1);
    const wrong = await http()
      .post("/api/v1/auth/login")
      .set("Cookie", cookie)
      .send({ email: user.email, password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(await userExists(guest.id)).toBe(true);
    expect(await cartOf(guest.id)).toHaveLength(1);
  });

  it("registering merges the same way", async () => {
    const { guest, cookie } = await startGuest();
    const { variant } = await makeVariant(db);
    const number = await order(guest.id, "new@example.com");
    await addToCart(db, guest.id, variant.id, 2);

    const res = await http()
      .post("/api/v1/auth/register")
      .set("Cookie", cookie)
      .send({
        name: "New Person",
        email: "New@Example.com",
        password: "password1",
      });
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    expect(res.body.data.role).toBe("customer");
    expect(await cartOf(id)).toEqual([{ variant_id: variant.id, quantity: 2 }]);
    expect((await orderRow(number)).user_id).toBe(id);
    expect(await userExists(guest.id)).toBe(false);
  });
});

describe("signing in with Google from a guest session", () => {
  const google = setupTestApp({
    cfg: {
      ...testConfig(),
      googleClientId: "client-123.apps.googleusercontent.com",
      googleClientSecret: "google-secret",
      googleRedirectUri: "http://localhost:5000/api/v1/auth/google/callback",
    },
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges the guest into the Google account", async () => {
    const { guest, cookie } = await startGuest();
    const { variant } = await makeVariant(db);
    const number = await order(guest.id, "ada@gmail.com");
    await addToCart(db, guest.id, variant.id, 3);

    const started = await google.http().get("/api/v1/auth/google");
    const url = new URL(started.headers.location as string);
    const state = cookieHeader(started);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const idToken = jwt.sign(
          {
            iss: "https://accounts.google.com",
            aud: "client-123.apps.googleusercontent.com",
            sub: "google-sub-1",
            email: "ada@gmail.com",
            email_verified: true,
            name: "Ada Lovelace",
            nonce: url.searchParams.get("nonce"),
          },
          "google-signs-this-not-us",
          { expiresIn: 3600 },
        );
        return new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const res = await google
      .http()
      .get("/api/v1/auth/google/callback")
      .set("Cookie", `${state}; ${cookie}`)
      .query({ code: "the-code", state: url.searchParams.get("state") });
    expect(res.status).toBe(302);
    const user = (
      await db.query<User>("SELECT * FROM users WHERE email = 'ada@gmail.com'")
    ).rows[0]!;
    expect(await cartOf(user.id)).toEqual([
      { variant_id: variant.id, quantity: 3 },
    ]);
    expect((await orderRow(number)).user_id).toBe(user.id);
    expect(await userExists(guest.id)).toBe(false);
  });
});

describe("mergedQuantity", () => {
  const v = (stock: number, available = true) => ({ stock, available });
  it("adds up within stock and the line limit", () => {
    expect(mergedQuantity(0, 2, 0, v(10))).toBe(2);
    expect(mergedQuantity(3, 4, 1, v(5))).toBe(5);
    expect(mergedQuantity(8, 5, 1, v(500))).toBe(MAX_LINE);
  });
  it("never lowers a line, and skips what can't be added", () => {
    expect(mergedQuantity(6, 1, 1, v(5))).toBeNull();
    expect(mergedQuantity(5, 1, 1, v(5))).toBeNull();
    expect(mergedQuantity(0, 1, 0, v(0))).toBeNull();
    expect(mergedQuantity(0, 1, 0, v(10, false))).toBeNull();
    expect(mergedQuantity(0, 1, MAX_CART_LINES, v(10))).toBeNull();
    expect(mergedQuantity(1, 1, MAX_CART_LINES, v(10))).toBe(2);
  });
});

describe("POST /orders/lookup", () => {
  const lookup = (body: object) =>
    http().post("/api/v1/orders/lookup").send(body);

  it("finds a placed order by its number and email, in any case", async () => {
    const guest = await makeGuest(db);
    const number = await order(guest.id, "ada@example.com");
    const res = await lookup({ number, email: " ADA@example.COM " });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      number,
      status: "paid",
      email: "ada@example.com",
      reviewed_product_ids: [],
    });
    expect(res.body.data.items).toHaveLength(1);

    // an account's order too, with no reviews offered
    const user = await makeUser(db, { email: "grace@example.com" });
    const theirs = await order(user.id);
    const found = await lookup({ number: theirs, email: "grace@example.com" });
    expect(found.status).toBe(200);
    expect(found.body.data.reviewed_product_ids).toEqual([]);
  });

  it("answers a wrong email as an unknown number", async () => {
    const guest = await makeGuest(db);
    const number = await order(guest.id, "ada@example.com");
    const wrong = await lookup({ number, email: "grace@example.com" });
    const unknown = await lookup({
      number: number + 100,
      email: "ada@example.com",
    });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
      });
    }
  });

  it("doesn't find an abandoned checkout", async () => {
    const guest = await makeGuest(db);
    const number = await order(guest.id, "ada@example.com", false);
    expect((await lookup({ number, email: "ada@example.com" })).status).toBe(
      404,
    );
  });

  it("checks the body", async () => {
    for (const body of [
      {},
      { number: 1001 },
      { number: "1001", email: "ada@example.com" },
      { number: 0, email: "ada@example.com" },
      { number: 1001, email: "nope" },
    ]) {
      const res = await lookup(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("guests in the admin", () => {
  it("lists a guest's order with its email, marked as a guest's", async () => {
    const guest = await makeGuest(db);
    const number = await order(guest.id, "ada@example.com");
    const { cookie } = await signIn(db, cfg, "admin");
    const list = await http().get("/api/v1/admin/orders").set("Cookie", cookie);
    expect(list.body.data[0]).toMatchObject({
      number,
      email: "ada@example.com",
      customer_name: "Guest",
      guest: true,
    });
    const detail = await http()
      .get(`/api/v1/admin/orders/${number}`)
      .set("Cookie", cookie);
    expect(detail.body.data.customer).toEqual({
      id: guest.id,
      name: "Guest",
      email: "ada@example.com",
      guest: true,
    });
    // guests aren't customers
    const customers = await http()
      .get("/api/v1/admin/customers")
      .set("Cookie", cookie);
    expect(customers.body.data).toEqual([]);
  });
});

describe("the guest cleanup", () => {
  /** A session of the user, live unless told otherwise. */
  const session = (
    userId: string,
    fields: { expired?: boolean; revoked?: boolean } = {},
  ) =>
    createSession(db, {
      id: randomUUID(),
      user_id: userId,
      current_token_hash: randomUUID(),
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + (fields.expired ? -DAY : DAY)),
    }).then(async (s) => {
      if (fields.revoked)
        await db.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [
          s!.id,
        ]);
    });
  const age = (userId: string, days: number) =>
    db.query(
      "UPDATE users SET created_at = now() - make_interval(days => $2) WHERE id = $1",
      [userId, days],
    );

  it("deletes old guests nobody can use, and nothing else", async () => {
    const unused = await makeGuest(db); // no session at all
    const expired = await makeGuest(db);
    const revoked = await makeGuest(db);
    const live = await makeGuest(db);
    const ordered = await makeGuest(db);
    const recent = await makeGuest(db);
    const customer = await makeUser(db);
    await session(expired.id, { expired: true });
    await session(revoked.id, { revoked: true });
    await session(live.id);
    await order(ordered.id, "ada@example.com");
    const { variant } = await makeVariant(db);
    await addToCart(db, unused.id, variant.id);
    for (const u of [unused, expired, revoked, live, ordered, customer])
      await age(u.id, 31);
    await age(recent.id, 29);

    expect((await cleanUp(db)).guests).toBe(3);
    for (const u of [unused, expired, revoked])
      expect(await userExists(u.id)).toBe(false);
    for (const u of [live, ordered, recent, customer])
      expect(await userExists(u.id)).toBe(true);
    expect(
      await count("SELECT count(*)::int AS n FROM carts WHERE user_id = $1", [
        unused.id,
      ]),
    ).toBe(0);
  });
});
