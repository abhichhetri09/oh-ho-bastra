import { beforeEach, describe, expect, it } from "vitest";
import { money, safeCell } from "../src/admin/csv";
import { periods, statusCounts } from "../src/admin/stats";
import type { User } from "../src/db/gen";
import { makeUser, setupTestApp, signIn } from "./helpers";

const { http, db, cfg } = setupTestApp();

let admin = "";
let adminUser: User;
beforeEach(async () => {
  const s = await signIn(db, cfg, "admin");
  admin = s.cookie;
  adminUser = s.user;
});

const get = (path: string) =>
  http().get(`/api/v1/admin${path}`).set("Cookie", admin);

interface OrderFields {
  status?: string;
  subtotal?: number;
  shipping?: number;
  email?: string;
  city?: string;
  createdAt?: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  tracking?: string | null;
}

async function makeOrder(user: User, f: OrderFields = {}) {
  const subtotal = f.subtotal ?? 2500;
  const shipping = f.shipping ?? 500;
  const status = f.status ?? "paid";
  const { rows } = await db.query(
    `INSERT INTO orders (user_id, status, subtotal, shipping, total, email, shipping_address, expires_at,
       paid_at, created_at, shipped_at, tracking_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '1 hour', $8, COALESCE($9::timestamptz, now()), $10, $11)
     RETURNING id, number`,
    [
      user.id,
      status,
      subtotal,
      shipping,
      subtotal + shipping,
      f.email ?? user.email,
      JSON.stringify({
        full_name: user.name,
        city: f.city ?? "Kathmandu",
        country: "NP",
      }),
      f.paidAt !== undefined
        ? f.paidAt
        : status === "pending" || status === "cancelled"
          ? null
          : new Date().toISOString(),
      f.createdAt ?? null,
      f.shippedAt ?? null,
      f.tracking ?? null,
    ],
  );
  return rows[0] as { id: string; number: number };
}

async function makeProduct(
  name = "Heavyweight Tee",
  { active = true, stock = 10, sku = "HEA-1" } = {},
) {
  const { rows } = await db.query(
    `INSERT INTO products (name, slug, images, image_public_ids, is_active)
     VALUES ($1, $2, '{https://img/1.jpg}', '{p1}', $3) RETURNING id`,
    [name, name.toLowerCase().replaceAll(" ", "-"), active],
  );
  const productId = (rows[0] as { id: string }).id;
  const v = await db.query(
    `INSERT INTO product_variants (product_id, sku, stock, images, image_public_ids, selling_price, is_default, option_combination_key)
     VALUES ($1, $2, $3, '{}', '{}', 2500, true, '') RETURNING id`,
    [productId, sku, stock],
  );
  return { productId, variantId: (v.rows[0] as { id: string }).id };
}

async function addItem(
  orderId: string,
  product: { productId: string; variantId: string },
  quantity = 1,
  shortfall = 0,
) {
  await db.query(
    `INSERT INTO order_items (order_id, variant_id, product_id, product_name, product_slug, sku, unit_price, quantity, line_total, stock_shortfall)
     VALUES ($1, $2, $3, 'Heavyweight Tee', 'heavyweight-tee', 'HEA-1', 2500, $4, $5, $6)`,
    [
      orderId,
      product.variantId,
      product.productId,
      quantity,
      2500 * quantity,
      shortfall,
    ],
  );
}

const EMPTY_STATUSES = {
  cancelled: 0,
  delivered: 0,
  paid: 0,
  pending: 0,
  refunded: 0,
  shipped: 0,
};

describe("admin access", () => {
  it("needs a session and the admin role", async () => {
    expect((await http().get("/api/v1/admin/stats")).status).toBe(401);
    const { cookie } = await signIn(db, cfg, "customer");
    const res = await http().get("/api/v1/admin/counts").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});

describe("dashboard helpers", () => {
  it("periods are whole UTC days ending today", () => {
    // Late on 12 Oct in UTC+5:45 is still 12 Oct in UTC.
    const now = new Date("2026-10-12T23:30:00+05:45");
    const { current, previous } = periods(now, 7);
    expect(current.from.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(current.to.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(previous.from.toISOString()).toBe("2026-09-29T00:00:00.000Z");
    expect(previous.to).toEqual(current.from);
  });

  it("statusCounts has every status, sorted", () => {
    const got = statusCounts([{ status: "paid", count: 3 }]);
    expect(Object.keys(got)).toEqual([
      "cancelled",
      "delivered",
      "paid",
      "pending",
      "refunded",
      "shipped",
    ]);
    expect(got).toMatchObject({ paid: 3, refunded: 0 });
  });
});

describe("GET /admin/stats", () => {
  it("rejects an unknown range", async () => {
    for (const q of ["?range=1y", "?range=", "?range=30"]) {
      const res = await get(`/stats${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: "range must be 7d, 30d or 90d",
        code: "INVALID_QUERY_PARAMETER",
      });
    }
  });

  it("is all zeros and empty lists on an empty store", async () => {
    const res = await get("/stats");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Stats fetched");
    const zero = {
      revenue: 0,
      orders: 0,
      average_order_value: 0,
      new_customers: 0,
    };
    const { series, ...rest } = res.body.data;
    expect(rest).toEqual({
      range: "30d",
      current: zero,
      previous: zero,
      customers: 0,
      orders_by_status: EMPTY_STATUSES,
      top_products: [],
      needs_attention: {
        to_ship: 0,
        oversold: 0,
        failed_emails: 0,
        out_of_stock: 0,
      },
      low_stock: [],
      recent_orders: [],
      recent_reviews: [],
    });
    expect(series).toHaveLength(30);
    expect(series[29]).toEqual({
      day: new Date().toISOString().slice(0, 10),
      revenue: 0,
      orders: 0,
    });
  });

  it("sums this period's sales", async () => {
    const customer = await makeUser(db);
    const product = await makeProduct("Heavyweight Tee", { stock: 0 });
    const a = await makeOrder(customer, { subtotal: 1000, shipping: 0 });
    const b = await makeOrder(customer, {
      subtotal: 2001,
      shipping: 0,
      status: "shipped",
    });
    await makeOrder(customer, { status: "pending" });
    await addItem(a.id, product, 2, 1);
    await addItem(b.id, product);

    const res = await get("/stats?range=7d");
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.range).toBe("7d");
    expect(d.current).toEqual({
      revenue: 3001,
      orders: 2,
      average_order_value: 1500,
      new_customers: 1,
    });
    expect(d.customers).toBe(1);
    expect(d.series).toHaveLength(7);
    expect(d.series[6]).toMatchObject({ revenue: 3001, orders: 2 });
    expect(d.orders_by_status).toEqual({
      ...EMPTY_STATUSES,
      paid: 1,
      shipped: 1,
      pending: 1,
    });
    expect(d.top_products).toEqual([
      {
        product_id: product.productId,
        product_name: "Heavyweight Tee",
        image: "https://img/1.jpg",
        units: 3,
        revenue: 7500,
      },
    ]);
    expect(d.needs_attention).toEqual({
      to_ship: 1,
      oversold: 1,
      failed_emails: 0,
      out_of_stock: 1,
    });
    expect(d.low_stock[0]).toMatchObject({
      product_id: product.productId,
      sku: "HEA-1",
      stock: 0,
    });
    expect(d.recent_orders).toHaveLength(2);
  });
});

describe("GET /admin/counts", () => {
  it("counts orders by status and what needs attention", async () => {
    const customer = await makeUser(db);
    await makeOrder(customer, { status: "paid" });
    const res = await get("/counts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Counts fetched",
      data: {
        orders_by_status: { ...EMPTY_STATUSES, paid: 1 },
        to_ship: 1,
        oversold: 0,
        failed_emails: 0,
        out_of_stock: 0,
      },
    });
  });
});

describe("GET /admin/search", () => {
  it("needs 1 to 100 characters", async () => {
    for (const q of ["", "%20%20", "a".repeat(101)]) {
      const res = await get(`/search?q=${q}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("q must be 1 to 100 characters");
    }
    expect((await get("/search")).status).toBe(400);
  });

  it("finds orders by number and by email, products and customers", async () => {
    const ada = await makeUser(db, {
      name: "Ada Lovelace",
      email: "ada@example.org",
    });
    const order = await makeOrder(ada);
    await makeProduct("Ada Tee", { sku: "ADA-1", active: false });

    for (const q of [
      String(order.number),
      `OHB-${order.number}`,
      `%23${order.number}`,
      `ohb-${order.number}`,
    ]) {
      const res = await get(`/search?q=${q}`);
      expect(
        res.body.data.orders.map((o: { number: number }) => o.number),
        q,
      ).toEqual([order.number]);
    }
    const res = await get("/search?q=ada");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Search done");
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0]).toMatchObject({
      number: order.number,
      customer_name: "Ada Lovelace",
    });
    expect(res.body.data.products).toEqual([
      expect.objectContaining({
        name: "Ada Tee",
        is_active: false,
        image: "https://img/1.jpg",
      }),
    ]);
    expect(res.body.data.customers).toEqual([
      expect.objectContaining({ id: ada.id, email: "ada@example.org" }),
    ]);
    expect(res.body.data.customers[0]).not.toHaveProperty("password_hash");
  });

  it("answers empty lists, not null", async () => {
    const res = await get("/search?q=nothing");
    expect(res.body.data).toEqual({ orders: [], products: [], customers: [] });
  });
});

describe("GET /admin/inventory", () => {
  it("refuses bad filters", async () => {
    for (const [q, message] of [
      ["stock=some", "stock must be out, low or in"],
      ["hidden=yes", "hidden must be true or false"],
      [`q=${"a".repeat(101)}`, "q must be at most 100 characters"],
    ]) {
      const res = await get(`/inventory?${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body).toMatchObject({
        code: "INVALID_QUERY_PARAMETER",
        message,
      });
    }
    expect((await get("/inventory?page=0")).body.code).toBe(
      "INVALID_PAGE_PARAMETER",
    );
  });

  it("lists variants with the count at each level", async () => {
    await makeProduct("Out Tee", { stock: 0, sku: "OUT-1" });
    await makeProduct("Low Tee", { stock: 3, sku: "LOW-1" });
    await makeProduct("In Tee", { stock: 30, sku: "IN-1" });
    await makeProduct("Hidden Tee", { stock: 30, sku: "HID-1", active: false });

    const res = await get("/inventory");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Inventory fetched");
    expect(res.body.data.counts).toEqual({
      out_of_stock: 1,
      low: 1,
      in_stock: 1,
    });
    expect(res.body.data.rows.map((r: { sku: string }) => r.sku)).toEqual([
      "OUT-1",
      "LOW-1",
      "IN-1",
    ]);
    expect(res.body.meta).toEqual({
      total: 3,
      total_pages: 1,
      page: 1,
      limit: 25,
      offset: 0,
    });

    const low = await get("/inventory?stock=low");
    expect(low.body.data.rows.map((r: { sku: string }) => r.sku)).toEqual([
      "LOW-1",
    ]);
    expect(low.body.meta.total).toBe(1);
    expect(low.body.data.counts).toEqual({
      out_of_stock: 1,
      low: 1,
      in_stock: 1,
    });

    expect((await get("/inventory?hidden=true")).body.meta.total).toBe(4);
    expect((await get("/inventory?q=low")).body.meta.total).toBe(1);
  });

  it("is an empty page 1 with nothing on sale", async () => {
    const res = await get("/inventory");
    expect(res.body.data).toEqual({
      rows: [],
      counts: { out_of_stock: 0, low: 0, in_stock: 0 },
    });
    expect((await get("/inventory?page=2")).status).toBe(400);
  });
});

describe("order filters", () => {
  it("refuses bad filters on the list and the export", async () => {
    for (const [path, message] of [
      [
        "/orders?status=lost",
        "status must be pending, paid, shipped, delivered, cancelled or refunded",
      ],
      [`/orders?q=${"a".repeat(101)}`, "q must be at most 100 characters"],
      ["/orders?customer=nope", "customer must be a user ID"],
      ["/orders?from=12-10-2026", "from must be a date (YYYY-MM-DD)"],
      ["/orders?to=2026-02-30", "to must be a date (YYYY-MM-DD)"],
      ["/orders?from=2026-10-12&to=2026-10-01", "to must not be before from"],
      ["/orders?sort=email", "sort must be one of created, total"],
      ["/orders?sort=total&dir=sideways", "dir must be asc or desc"],
      ["/orders/export.csv?to=yesterday", "to must be a date (YYYY-MM-DD)"],
      ["/customers?sort=name", "sort must be one of joined, orders, spend"],
    ] as [string, string][]) {
      const res = await get(path);
      expect(res.status, path).toBe(400);
      expect(res.body, path).toEqual({
        success: false,
        message,
        code: "INVALID_QUERY_PARAMETER",
      });
    }
  });
});

describe("GET /admin/orders", () => {
  it("lists every order newest first with pagination", async () => {
    const ada = await makeUser(db, {
      name: "Ada Lovelace",
      email: "ada@example.org",
    });
    const first = await makeOrder(ada, {
      createdAt: "2026-10-01T10:00:00Z",
      status: "pending",
    });
    const second = await makeOrder(ada, {
      createdAt: "2026-10-05T10:00:00Z",
      subtotal: 9000,
    });

    const res = await get("/orders");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Orders fetched");
    expect(res.body.meta).toEqual({
      total: 2,
      total_pages: 1,
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(res.body.data.map((o: { number: number }) => o.number)).toEqual([
      second.number,
      first.number,
    ]);
    expect(res.body.data[1]).toEqual({
      id: first.id,
      number: first.number,
      status: "pending",
      total: 3000,
      currency: "usd",
      email: "ada@example.org",
      customer_name: "Ada Lovelace",
      guest: false,
      item_count: 0,
      created_at: "2026-10-01T10:00:00.000Z",
      paid_at: null,
    });

    const numbers = async (q: string) =>
      (await get(`/orders?${q}`)).body.data.map(
        (o: { number: number }) => o.number,
      );
    expect(await numbers("status=pending")).toEqual([first.number]);
    expect(await numbers(`q=OHB-${first.number}`)).toEqual([first.number]);
    expect(await numbers("q=ADA@")).toEqual([second.number, first.number]);
    expect(await numbers("q=nobody")).toEqual([]);
    expect(await numbers(`customer=${ada.id.toUpperCase()}`)).toEqual([
      second.number,
      first.number,
    ]);
    expect(await numbers(`customer=${adminUser.id}`)).toEqual([]);
    expect(await numbers("from=2026-10-01&to=2026-10-01")).toEqual([
      first.number,
    ]);
    expect(await numbers("from=2026-10-02")).toEqual([second.number]);
    expect(await numbers("sort=total&dir=asc")).toEqual([
      first.number,
      second.number,
    ]);
    expect(await numbers("sort=created&dir=asc")).toEqual([
      first.number,
      second.number,
    ]);
  });

  it("allows page 1 when empty but nothing past the last page", async () => {
    const res = await get("/orders");
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({
      total: 0,
      total_pages: 0,
      page: 1,
      limit: 20,
      offset: 0,
    });
    const past = await get("/orders?page=2");
    expect(past.status).toBe(400);
    expect(past.body.code).toBe("INVALID_PAGE_PARAMETER");
  });
});

describe("GET /admin/orders/export.csv", () => {
  it("writes the filtered orders as CSV", async () => {
    const ada = await makeUser(db, {
      name: '=HYPERLINK("x")',
      email: "ada@example.org",
    });
    const bob = await makeUser(db, {
      name: 'Bob, "the" Builder',
      email: "bob@example.org",
    });
    const product = await makeProduct();
    const a = await makeOrder(ada, {
      createdAt: "2026-10-01T10:00:00.123Z",
      paidAt: "2026-10-01T10:05:00Z",
      shippedAt: "2026-10-02T08:00:00Z",
      status: "shipped",
      tracking: "+1Z999",
      subtotal: 123405,
      shipping: 50,
      city: " Lalitpur",
    });
    await addItem(a.id, product, 3);
    const b = await makeOrder(bob, {
      createdAt: "2026-10-03T00:00:00Z",
      status: "pending",
      subtotal: 5,
      shipping: 0,
    });

    const res = await get("/orders/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    const today = new Date().toISOString().slice(0, 10);
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="orders-${today}.csv"`,
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers.etag).toBeUndefined();
    expect(res.text).toBe(
      "order,status,placed_at,paid_at,shipped_at,customer,email,items,subtotal,discount,shipping,total,currency,coupon_code,tracking_number,ship_city,ship_country\n" +
        `OHB-${b.number},pending,2026-10-03T00:00:00Z,,,"Bob, ""the"" Builder",bob@example.org,0,0.05,0.00,0.00,0.05,usd,,,Kathmandu,NP\n` +
        `OHB-${a.number},shipped,2026-10-01T10:00:00Z,2026-10-01T10:05:00Z,2026-10-02T08:00:00Z,"'=HYPERLINK(""x"")",ada@example.org,3,1234.05,0.00,0.50,1234.55,usd,,'+1Z999," Lalitpur",NP\n`,
    );

    const filtered = await get(`/orders/export.csv?status=pending`);
    expect(filtered.text.split("\n")).toHaveLength(3);
  });

  it("is only the header when nothing matches", async () => {
    const res = await get("/orders/export.csv?q=nobody");
    expect(res.status).toBe(200);
    expect(res.text).toBe(
      "order,status,placed_at,paid_at,shipped_at,customer,email,items,subtotal,discount,shipping,total,currency,coupon_code,tracking_number,ship_city,ship_country\n",
    );
  });

  it("defuses formula cells and formats money", () => {
    const cells: Record<string, string> = {
      "Ada Lovelace": "Ada Lovelace",
      '=HYPERLINK("x")': '\'=HYPERLINK("x")',
      "+44 20 7946 0958": "'+44 20 7946 0958",
      "-1+1": "'-1+1",
      "@SUM(A1)": "'@SUM(A1)",
      "\tcmd": "'\tcmd",
      "": "",
      "ada@example.org": "ada@example.org",
      "1Z999AA10123456784": "1Z999AA10123456784",
    };
    for (const [input, want] of Object.entries(cells))
      expect(safeCell(input)).toBe(want);
    const amounts: [number, string][] = [
      [0, "0.00"],
      [5, "0.05"],
      [1250, "12.50"],
      [123456, "1234.56"],
    ];
    for (const [cents, want] of amounts) expect(money(cents)).toBe(want);
  });
});

describe("GET /admin/orders/:number", () => {
  it("refuses a bad number and a missing order", async () => {
    for (const n of ["abc", "0", "-3", "1.5", "99999999999999999999"]) {
      const res = await get(`/orders/${n}`);
      expect(res.status, n).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message: "Invalid order number",
        code: "INVALID_ORDER_NUMBER",
      });
    }
    for (const n of ["999", "9223372036854775807"]) {
      const res = await get(`/orders/${n}`);
      expect(res.status, n).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }
  });

  it("is the order with its lines' shortfall, customer and payment", async () => {
    const ada = await makeUser(db, {
      name: "Ada Lovelace",
      email: "ada@example.org",
    });
    const product = await makeProduct();
    const order = await makeOrder(ada);
    await addItem(order.id, product, 2, 1);

    const res = await get(`/orders/${order.number}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order fetched");
    const d = res.body.data;
    expect(Object.keys(d)).toEqual([
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
      "customer",
      "payment",
    ]);
    expect(d.shipping_address).toEqual({
      full_name: "Ada Lovelace",
      city: "Kathmandu",
      country: "NP",
    });
    expect(d.customer).toEqual({
      id: ada.id,
      name: "Ada Lovelace",
      email: "ada@example.org",
      guest: false,
    });
    expect(d.payment).toBeNull();
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({
      product_name: "Heavyweight Tee",
      quantity: 2,
      options: [],
      stock_shortfall: 1,
    });
    expect(Object.keys(d.items[0]).at(-1)).toBe("stock_shortfall");

    await db.query(
      "INSERT INTO payments (order_id, stripe_session_id, stripe_payment_intent_id, amount, currency) VALUES ($1, 'cs_1', 'pi_1', 3000, 'usd')",
      [order.id],
    );
    const paid = await get(`/orders/OHB-${order.number}`);
    expect(paid.status).toBe(400);
    const withPayment = await get(`/orders/+${order.number}`);
    expect(withPayment.body.data.payment).toMatchObject({
      order_id: order.id,
      amount: 3000,
      stripe_payment_intent_id: "pi_1",
    });
  });
});

describe("GET /admin/customers", () => {
  it("refuses bad input", async () => {
    expect((await get(`/customers?q=${"a".repeat(101)}`)).body.code).toBe(
      "INVALID_QUERY_PARAMETER",
    );
    expect((await get("/customers?page=0")).body.code).toBe(
      "INVALID_PAGE_PARAMETER",
    );
    const res = await get("/customers/nope");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid user ID",
      code: "INVALID_USER_ID",
    });
  });

  it("lists customers, not admins, with their totals", async () => {
    const ada = await makeUser(db, {
      name: "Ada Lovelace",
      email: "ada@example.org",
    });
    await makeUser(db, { name: "Grace Hopper", email: "grace@example.org" });
    await makeOrder(ada, { subtotal: 1000, shipping: 0 });

    const res = await get("/customers?sort=spend");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Customers fetched");
    expect(res.body.meta).toEqual({
      total: 2,
      total_pages: 1,
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(res.body.data[0]).toMatchObject({
      id: ada.id,
      name: "Ada Lovelace",
      orders: 1,
      spend: 1000,
    });
    expect(res.body.data[0]).not.toHaveProperty("password_hash");

    const found = await get("/customers?q=GRACE");
    expect(found.body.data.map((c: { email: string }) => c.email)).toEqual([
      "grace@example.org",
    ]);
    expect((await get("/customers?q=50%25")).body.data).toEqual([]);
  });

  it("is one customer with addresses and reviews; admins are not customers", async () => {
    const ada = await makeUser(db, { name: "Ada Lovelace" });
    const empty = await get(`/customers/${ada.id}`);
    expect(empty.status).toBe(200);
    expect(empty.body.message).toBe("Customer fetched");
    expect(empty.body.data).toMatchObject({
      id: ada.id,
      orders: 0,
      spend: 0,
      paid_orders: 0,
      average_order_value: 0,
      addresses: [],
      reviews: [],
    });

    await makeOrder(ada, { subtotal: 1000, shipping: 0 });
    await makeOrder(ada, { subtotal: 2001, shipping: 0 });
    const res = await get(`/customers/${ada.id}`);
    expect(res.body.data).toMatchObject({
      paid_orders: 2,
      spend: 3001,
      average_order_value: 1500,
    });

    const missing = await get(`/customers/${adminUser.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      success: false,
      message: "Customer not found",
      code: "CUSTOMER_NOT_FOUND",
    });
  });
});

describe("PUT /admin/settings", () => {
  beforeEach(async () => {
    // The singleton row the migration inserts; the test reset empties it.
    await db.query(
      "INSERT INTO store_settings DEFAULT VALUES ON CONFLICT DO NOTHING",
    );
  });

  it("switches the theme", async () => {
    const res = await http()
      .put("/api/v1/admin/settings")
      .set("Cookie", admin)
      .send({ theme: " studio " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Store theme updated",
      data: { theme: "studio" },
    });
    expect(Object.keys(res.body.data)).toEqual([
      "theme",
      "announcements",
      "announcements_enabled",
      "business_name",
      "business_id",
      "business_address",
      "business_email",
      "business_phone",
      "updated_at",
    ]);
  });

  it("validates the theme as Go did", async () => {
    const put = (body: unknown) =>
      http()
        .put("/api/v1/admin/settings")
        .set("Cookie", admin)
        .send(body as object);
    const cases: [unknown, object][] = [
      [
        {},
        {
          code: "REQUIRED_FIELD",
          field: "theme",
          message: "Theme is required",
        },
      ],
      [
        { theme: "  " },
        {
          code: "REQUIRED_FIELD",
          field: "theme",
          message: "Theme is required",
        },
      ],
      [
        { theme: "neon" },
        {
          code: "INVALID_VALUE",
          field: "theme",
          message: "Theme must be one of: editorial, studio, botanical",
        },
      ],
      [
        { theme: 5 },
        {
          code: "INVALID_TYPE",
          field: "theme",
          message: "Theme must be a string",
        },
      ],
    ];
    for (const [body, error] of cases) {
      const res = await put(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body, JSON.stringify(body)).toEqual({
        success: false,
        message: "Invalid request body",
        code: "VALIDATION_FAILED",
        errors: [error],
      });
    }
  });
});

describe("PUT /admin/settings/announcements", () => {
  beforeEach(async () => {
    await db.query(
      "INSERT INTO store_settings DEFAULT VALUES ON CONFLICT DO NOTHING",
    );
  });

  const put = (body: unknown, cookie = admin) =>
    http()
      .put("/api/v1/admin/settings/announcements")
      .set("Cookie", cookie)
      .send(body as object);

  it("replaces the messages in order, trimmed, and the storefront sees them", async () => {
    const res = await put({
      announcements_enabled: true,
      announcements: [" Autumn sale ", "New tees in"],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Announcements updated",
      data: {
        theme: "editorial",
        announcements: ["Autumn sale", "New tees in"],
        announcements_enabled: true,
        business_name: "",
        business_id: "",
        business_address: "",
        business_email: "",
        business_phone: "",
        updated_at: expect.any(String),
      },
    });
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.announcements).toEqual([
      "Autumn sale",
      "New tees in",
    ]);
  });

  it("takes an empty list, which hides the banner", async () => {
    const res = await put({ announcements_enabled: true, announcements: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.announcements).toEqual([]);
  });

  it("turns the banner off and keeps its messages", async () => {
    const res = await put({
      announcements_enabled: false,
      announcements: ["Kept for later"],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      announcements_enabled: false,
      announcements: ["Kept for later"],
    });
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data).toMatchObject({
      announcements_enabled: false,
      announcements: ["Kept for later"],
    });
  });

  it("leaves the theme alone, and a theme change leaves the messages", async () => {
    await put({ announcements_enabled: true, announcements: ["Hello"] });
    const theme = await http()
      .put("/api/v1/admin/settings")
      .set("Cookie", admin)
      .send({ theme: "studio" });
    expect(theme.body.data).toMatchObject({
      theme: "studio",
      announcements: ["Hello"],
    });
  });

  it("validates the list and each message", async () => {
    const cases: [unknown, object][] = [
      [
        { announcements_enabled: true },
        {
          code: "REQUIRED_FIELD",
          field: "announcements",
          message: "Announcements is required",
        },
      ],
      [
        { announcements: [] },
        {
          code: "REQUIRED_FIELD",
          field: "announcements_enabled",
          message: "Announcements enabled is required",
        },
      ],
      [
        { announcements_enabled: true, announcements: ["ok", "  "] },
        {
          code: "REQUIRED_FIELD",
          field: "announcements.1",
          message: "Write a message or remove it",
        },
      ],
      [
        { announcements_enabled: true, announcements: ["x".repeat(81)] },
        {
          code: "TOO_LONG",
          field: "announcements.0",
          message: "Keep each message to 80 characters",
        },
      ],
      [
        {
          announcements_enabled: true,
          announcements: ["a", "b", "c", "d", "e", "f", "g"],
        },
        {
          code: "TOO_LONG",
          field: "announcements",
          message: "The banner holds at most 6 messages",
        },
      ],
      [
        { announcements_enabled: true, announcements: "Sale" },
        {
          code: "INVALID_TYPE",
          field: "announcements",
          message: "Announcements must be a list",
        },
      ],
    ];
    for (const [body, error] of cases) {
      const res = await put(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.errors).toEqual([error]);
    }
  });

  it("is for admins only", async () => {
    const { cookie } = await signIn(db, cfg);
    expect(
      (await put({ announcements_enabled: true, announcements: [] }, cookie))
        .status,
    ).toBe(403);
  });
});

describe("PUT /admin/settings/business", () => {
  beforeEach(async () => {
    await db.query(
      "INSERT INTO store_settings DEFAULT VALUES ON CONFLICT DO NOTHING",
    );
  });

  const details = {
    business_name: " Oh Ho Bastra ",
    business_id: "1234567-8",
    business_address: "Street 1\n00100 Helsinki\nFinland",
    business_email: "hello@ohhobastra.fi",
    business_phone: "",
  };

  const put = (body: unknown, cookie = admin) =>
    http()
      .put("/api/v1/admin/settings/business")
      .set("Cookie", cookie)
      .send(body as object);

  it("saves the details, trimmed, and the storefront sees them", async () => {
    const res = await put(details);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Business details updated",
      data: { ...details, business_name: "Oh Ho Bastra" },
    });
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data).toMatchObject({
      business_name: "Oh Ho Bastra",
      business_address: "Street 1\n00100 Helsinki\nFinland",
    });
  });

  it("clears fields with empty strings", async () => {
    await put(details);
    const res = await put({
      business_name: "",
      business_id: "",
      business_address: "",
      business_email: "",
      business_phone: "",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.business_name).toBe("");
    expect(res.body.data.business_email).toBe("");
  });

  it("rejects an invalid email and an over-long field", async () => {
    const bad = await put({ ...details, business_email: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_FAILED");
    expect(bad.body.errors[0].field).toBe("business_email");
    const long = await put({ ...details, business_id: "x".repeat(41) });
    expect(long.status).toBe(400);
    expect(long.body.errors[0].field).toBe("business_id");
  });

  it("is for admins only", async () => {
    const { cookie } = await signIn(db, cfg);
    expect((await put(details, cookie)).status).toBe(403);
    expect(
      (await http().put("/api/v1/admin/settings/business").send(details))
        .status,
    ).toBe(401);
  });
});
