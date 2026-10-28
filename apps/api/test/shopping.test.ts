import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "../src/db/gen";
import {
  buildCart,
  checkAdd,
  checkUpdate,
  MAX_CART_LINES,
} from "../src/shopping/cart";
import { displayName, summarise } from "../src/shopping/reviews";
import { cookieFor, makeUser, setupTestApp } from "./helpers";

// The cart, wishlist and reviews (ports of internal/handlers/cart, wishlist,
// review and admin/reviews.go, and their tests).

const { http, db, cfg } = setupTestApp();

interface ProductOpts {
  stock?: number;
  price?: number;
  offer?: number | null;
  active?: boolean;
  variantActive?: boolean;
}

/** A product with a default variant (size M), on sale by default. */
async function product(name = "Tee", o: ProductOpts = {}) {
  const slug = `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID().slice(0, 6)}`;
  const {
    rows: [p],
  } = await db.query<{ id: string; slug: string }>(
    `INSERT INTO products (name, slug, images, image_public_ids, is_active)
     VALUES ($1, $2, '{https://img/p.png}', '{p}', $3) RETURNING id, slug`,
    [name, slug, o.active ?? true],
  );
  const variant = await addVariant(p!.id, { ...o, isDefault: true });
  const {
    rows: [opt],
  } = await db.query<{ id: string }>(
    "INSERT INTO product_options (product_id, name) VALUES ($1, 'Size') RETURNING id",
    [p!.id],
  );
  const {
    rows: [val],
  } = await db.query<{ id: string }>(
    "INSERT INTO product_option_values (option_id, value) VALUES ($1, 'M') RETURNING id",
    [opt!.id],
  );
  await db.query(
    "INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1, $2)",
    [variant, val!.id],
  );
  return { id: p!.id, slug: p!.slug, variant };
}

async function addVariant(
  productId: string,
  o: ProductOpts & { isDefault?: boolean } = {},
) {
  const key = randomUUID();
  const {
    rows: [v],
  } = await db.query<{ id: string }>(
    `INSERT INTO product_variants
       (product_id, sku, stock, images, image_public_ids, selling_price, offer_price, is_default, is_active, option_combination_key)
     VALUES ($1, $2, $3, '{}', '{}', $4, $5, $6, $7, $8) RETURNING id`,
    [
      productId,
      `SKU-${key.slice(0, 8)}`,
      o.stock ?? 5,
      o.price ?? 2000,
      o.offer ?? null,
      o.isDefault ?? false,
      o.variantActive ?? true,
      key,
    ],
  );
  return v!.id;
}

/** A paid order of user's holding the product, so they may review it. */
async function buy(user: User, productId: string, status = "paid") {
  const {
    rows: [order],
  } = await db.query<{ id: string }>(
    `INSERT INTO orders (user_id, status, subtotal, shipping, total, email, shipping_address, expires_at)
     VALUES ($1, $2, 100, 0, 100, $3, '{}', now() + interval '1 hour') RETURNING id`,
    [user.id, status, user.email],
  );
  await db.query(
    `INSERT INTO order_items (order_id, product_id, product_name, product_slug, unit_price, quantity, line_total)
     VALUES ($1, $2, 'Tee', 'tee', 100, 1, 100)`,
    [order!.id, productId],
  );
}

let user: User;
let cookie = "";
beforeEach(async () => {
  user = await makeUser(db);
  cookie = cookieFor(cfg, user);
});

const onSale = (stock: number) => ({ stock, available: true });

describe("cart rules", () => {
  it.each([
    ["new line within stock", 0, 2, 3, onSale(5), null],
    ["tops up an existing line", 2, 3, 3, onSale(5), null],
    [
      "counts what is already in the cart",
      4,
      2,
      3,
      onSale(5),
      "INSUFFICIENT_STOCK",
    ],
    ["out of stock", 0, 1, 0, onSale(0), "INSUFFICIENT_STOCK"],
    [
      "off sale",
      0,
      1,
      0,
      { stock: 9, available: false },
      "VARIANT_UNAVAILABLE",
    ],
    ["per-line limit", 8, 3, 3, onSale(100), "CART_QUANTITY_LIMIT"],
    ["exactly the per-line limit", 8, 2, 3, onSale(100), null],
    [
      "full cart refuses a new line",
      0,
      1,
      MAX_CART_LINES,
      onSale(5),
      "CART_FULL",
    ],
    ["full cart still tops up a line", 1, 1, MAX_CART_LINES, onSale(5), null],
  ])("checkAdd: %s", (_name, existing, add, lines, v, want) => {
    expect(checkAdd(existing, add, lines, v)?.code ?? null).toBe(want);
  });

  it.each([
    ["raise within stock", 1, 3, onSale(3), null],
    ["raise past stock", 1, 4, onSale(3), "INSUFFICIENT_STOCK"],
    ["lowering a short line is allowed", 5, 2, onSale(1), null],
    [
      "lowering an off-sale line is allowed",
      3,
      1,
      { stock: 9, available: false },
      null,
    ],
    [
      "raising an off-sale line is not",
      1,
      2,
      { stock: 9, available: false },
      "VARIANT_UNAVAILABLE",
    ],
  ])("checkUpdate: %s", (_name, current, next, v, want) => {
    expect(checkUpdate(current, next, v)?.code ?? null).toBe(want);
  });

  it("words a stock shortfall", () => {
    expect(checkUpdate(0, 1, onSale(0))?.message).toBe(
      "This item is out of stock",
    );
    expect(checkUpdate(0, 3, onSale(2))?.message).toBe("Only 2 left");
    expect(checkAdd(2, 1, 1, onSale(2))?.message).toBe(
      "Only 2 left, and 2 already in your bag",
    );
  });

  it("totals only the lines that can be checked out", () => {
    const line = { quantity: 2, price: 1500, stock: 30, available: true };
    const cart = buildCart([
      line,
      { quantity: 3, price: 1000, stock: 1, available: true }, // above its stock
      { quantity: 1, price: 5000, stock: 9, available: false }, // off sale
    ] as never);
    expect(cart).toMatchObject({
      item_count: 2,
      subtotal: 3000,
      has_issues: true,
    });
    expect(cart.items.map((i) => [i.line_total, i.max_quantity])).toEqual([
      [3000, 10],
      [3000, 1],
      [5000, 0],
    ]);
    expect(buildCart([])).toEqual({
      items: [],
      item_count: 0,
      subtotal: 0,
      has_issues: false,
    });
  });
});

describe("GET /cart", () => {
  it("needs a signed-in user", async () => {
    const res = await http().get("/api/v1/cart");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("MISSING_ACCESS_TOKEN");
  });

  it("is empty without a cart", async () => {
    const res = await http().get("/api/v1/cart").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Cart fetched",
      data: {
        items: [],
        item_count: 0,
        subtotal: 0,
        discount: 0,
        shipping: 0,
        total: 0,
        coupon: null,
        has_issues: false,
      },
    });
  });

  it("prices lines live and flags issues", async () => {
    const tee = await product("Tee", { stock: 5, price: 2000, offer: 1500 });
    const res1 = await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 2 });
    expect(res1.status).toBe(200);
    await db.query("UPDATE product_variants SET stock = 1 WHERE id = $1", [
      tee.variant,
    ]);

    const res = await http().get("/api/v1/cart").set("Cookie", cookie);
    expect(res.body.data).toEqual({
      items: [
        {
          variant_id: tee.variant,
          quantity: 2,
          added_at: expect.any(String),
          product_id: tee.id,
          product_name: "Tee",
          product_slug: tee.slug,
          sku: expect.stringMatching(/^SKU-/),
          stock: 1,
          image: "https://img/p.png",
          selling_price: 2000,
          offer_price: 1500,
          price: 1500,
          available: true,
          options: [{ name: "Size", value: "M", type: "text" }],
          line_total: 3000,
          max_quantity: 1,
        },
      ],
      item_count: 0,
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      coupon: null,
      has_issues: true,
    });
  });
});

describe("POST /cart/items", () => {
  const add = (body: object) =>
    http().post("/api/v1/cart/items").set("Cookie", cookie).send(body);

  it("adds on top of what is in the cart", async () => {
    const tee = await product("Tee", { stock: 5, price: 2000 });
    expect(
      (await add({ variant_id: tee.variant, quantity: 2 })).body.message,
    ).toBe("Added to your bag");
    const res = await add({
      variant_id: tee.variant.toUpperCase(),
      quantity: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      item_count: 3,
      subtotal: 6000,
      has_issues: false,
    });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      quantity: 3,
      offer_price: null,
      max_quantity: 5,
    });
  });

  it("refuses more than is in stock", async () => {
    const tee = await product("Tee", { stock: 3 });
    await add({ variant_id: tee.variant, quantity: 2 });
    const res = await add({ variant_id: tee.variant, quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Only 3 left, and 2 already in your bag",
      code: "INSUFFICIENT_STOCK",
    });
  });

  it("refuses more than 10 of an item", async () => {
    const tee = await product("Tee", { stock: 50 });
    await add({ variant_id: tee.variant, quantity: 9 });
    const res = await add({ variant_id: tee.variant, quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "CART_QUANTITY_LIMIT",
      message: "You can add up to 10 of an item",
    });
  });

  it("refuses a variant off sale", async () => {
    for (const opts of [{ variantActive: false }, { active: false }]) {
      const tee = await product("Tee", opts);
      const res = await add({ variant_id: tee.variant, quantity: 1 });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: "VARIANT_UNAVAILABLE",
        message: "This item is no longer available",
      });
    }
  });

  it("404s an unknown variant", async () => {
    const res = await add({ variant_id: randomUUID(), quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "VARIANT_NOT_FOUND",
      message: "Product variant not found",
    });
  });

  it("refuses a 51st line but tops up an existing one", async () => {
    const tee = await product("Tee", { stock: 100 });
    const {
      rows: [cart],
    } = await db.query<{ id: string }>(
      "INSERT INTO carts (user_id) VALUES ($1) RETURNING id",
      [user.id],
    );
    const variants = [tee.variant];
    for (let i = 1; i < MAX_CART_LINES; i++)
      variants.push(await addVariant(tee.id, { stock: 100 }));
    for (const v of variants) {
      await db.query(
        "INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, 1)",
        [cart!.id, v],
      );
    }
    const extra = await addVariant(tee.id, { stock: 100 });
    const res = await add({ variant_id: extra, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "CART_FULL",
      message: "Your bag can hold 50 different items",
    });
    expect((await add({ variant_id: tee.variant, quantity: 1 })).status).toBe(
      200,
    );
  });

  it("validates the body as Go did", async () => {
    let res = await add({ variant_id: "", quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "REQUIRED_FIELD",
          field: "variant_id",
          message: "Variant id is required",
        },
        {
          code: "REQUIRED_FIELD",
          field: "quantity",
          message: "Quantity is required",
        },
      ],
    });
    res = await add({ variant_id: "nope", quantity: 11 });
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_UUID",
        field: "variant_id",
        message: "Variant id must be a valid ID",
      },
      {
        code: "OUT_OF_RANGE",
        field: "quantity",
        message: "Quantity must be at most 10",
      },
    ]);
    res = await add({ variant_id: randomUUID(), quantity: -1 });
    expect(res.body.errors).toEqual([
      {
        code: "OUT_OF_RANGE",
        field: "quantity",
        message: "Quantity must be at least 1",
      },
    ]);
    res = await add({ variant_id: randomUUID(), quantity: "2" });
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_TYPE",
        field: "quantity",
        message: "Quantity must be a whole number",
      },
    ]);
    res = await add({ quantity: 1 });
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "variant_id",
        message: "Variant id is required",
      },
    ]);
  });

  it("accepts any hex id, as Go's uuid rule did", async () => {
    const res = await add({
      variant_id: "11111111-1111-1111-1111-111111111111",
      quantity: 1,
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("VARIANT_NOT_FOUND");
  });
});

describe("PATCH /cart/items/:variantID", () => {
  const patch = (id: string, body: object) =>
    http().patch(`/api/v1/cart/items/${id}`).set("Cookie", cookie).send(body);

  it("sets a line's quantity", async () => {
    const tee = await product("Tee", { stock: 5, price: 1000 });
    await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 1 });
    const res = await patch(tee.variant, { quantity: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "Bag updated",
      data: { item_count: 4, subtotal: 4000 },
    });
  });

  it("lets a short or off-sale line be lowered but not raised", async () => {
    const tee = await product("Tee", { stock: 5 });
    await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 4 });
    await db.query("UPDATE product_variants SET stock = 2 WHERE id = $1", [
      tee.variant,
    ]);
    let res = await patch(tee.variant, { quantity: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.has_issues).toBe(true);
    res = await patch(tee.variant, { quantity: 4 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      message: "Only 2 left",
    });
    await db.query(
      "UPDATE product_variants SET is_active = false WHERE id = $1",
      [tee.variant],
    );
    res = await patch(tee.variant, { quantity: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ has_issues: true, item_count: 0 });
    expect(res.body.data.items[0]).toMatchObject({
      available: false,
      max_quantity: 0,
    });
    expect((await patch(tee.variant, { quantity: 2 })).body.code).toBe(
      "VARIANT_UNAVAILABLE",
    );
  });

  it("404s a line not in the cart", async () => {
    const tee = await product();
    const res = await patch(tee.variant, { quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "This item is not in your bag",
      code: "CART_ITEM_NOT_FOUND",
    });
  });

  it("checks the id before the body", async () => {
    const res = await patch("nope", {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid variant ID",
      code: "INVALID_VARIANT_ID",
    });
    const res2 = await patch(randomUUID(), { quantity: 0 });
    expect(res2.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "quantity",
        message: "Quantity is required",
      },
    ]);
  });
});

describe("DELETE /cart/items/:variantID and /cart", () => {
  it("removes a line, then 404s it", async () => {
    const tee = await product();
    await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 1 });
    const res = await http()
      .delete(`/api/v1/cart/items/${tee.variant}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Removed from your bag",
      data: {
        items: [],
        item_count: 0,
        subtotal: 0,
        discount: 0,
        shipping: 0,
        total: 0,
        coupon: null,
        has_issues: false,
      },
    });
    const again = await http()
      .delete(`/api/v1/cart/items/${tee.variant}`)
      .set("Cookie", cookie);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("CART_ITEM_NOT_FOUND");
    expect(
      (await http().delete("/api/v1/cart/items/x").set("Cookie", cookie)).body
        .code,
    ).toBe("INVALID_VARIANT_ID");
  });

  it("clears the cart, even an empty one", async () => {
    const tee = await product();
    await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 1 });
    for (let i = 0; i < 2; i++) {
      const res = await http().delete("/api/v1/cart").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: "Bag cleared",
        data: { items: [] },
      });
    }
  });

  it("keeps concurrent adds within stock", async () => {
    const tee = await product("Tee", { stock: 3 });
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        http()
          .post("/api/v1/cart/items")
          .set("Cookie", cookie)
          .send({ variant_id: tee.variant, quantity: 1 }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200]);
    const extra = await http()
      .post("/api/v1/cart/items")
      .set("Cookie", cookie)
      .send({ variant_id: tee.variant, quantity: 1 });
    expect(extra.status).toBe(409);
  });
});

describe("wishlist", () => {
  const put = (id: string) =>
    http().put(`/api/v1/wishlist/${id}`).set("Cookie", cookie);

  it("needs a signed-in user", async () => {
    for (const res of [
      await http().get("/api/v1/wishlist"),
      await http().put(`/api/v1/wishlist/${randomUUID()}`),
    ]) {
      expect(res.status).toBe(401);
    }
  });

  it("is empty at first", async () => {
    const res = await http().get("/api/v1/wishlist").set("Cookie", cookie);
    expect(res.body).toEqual({
      success: true,
      message: "Wishlist fetched",
      data: [],
      meta: { total: 0, total_pages: 0, page: 1, limit: 24, offset: 0 },
    });
    const ids = await http().get("/api/v1/wishlist/ids").set("Cookie", cookie);
    expect(ids.body).toEqual({
      success: true,
      message: "Wishlist fetched",
      data: [],
    });
  });

  it("saves products once and lists those on sale, newest first", async () => {
    const a = await product("Alpha", { price: 2000, offer: 1500 });
    const b = await product("Beta");
    for (const id of [a.id, b.id, b.id.toUpperCase()]) {
      const res = await put(id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "Saved to your wishlist",
      });
    }
    await db.query(
      "UPDATE wishlist_items SET created_at = now() - interval '1 minute' WHERE product_id = $1",
      [a.id],
    );

    const ids = await http().get("/api/v1/wishlist/ids").set("Cookie", cookie);
    expect(ids.body.data).toEqual([b.id, a.id]);

    await db.query("UPDATE products SET is_active = false WHERE id = $1", [
      b.id,
    ]);
    const res = await http().get("/api/v1/wishlist").set("Cookie", cookie);
    expect(res.body.meta).toEqual({
      total: 1,
      total_pages: 1,
      page: 1,
      limit: 24,
      offset: 0,
    });
    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: a.id,
        name: "Alpha",
        description: null,
        category_id: null,
        features: [],
        variant_id: a.variant,
        selling_price: 2000,
        offer_price: 1500,
        price: 1500,
        in_stock: true,
        rating_count: 0,
        rating_avg: 0,
        variant_count: 1,
        saved_at: expect.any(String),
      }),
    ]);
    // the hidden product still counts as saved
    expect(
      (await http().get("/api/v1/wishlist/ids").set("Cookie", cookie)).body
        .data,
    ).toHaveLength(2);
  });

  it("refuses a product not on sale or a bad id", async () => {
    const off = await product("Off", { active: false });
    for (const id of [off.id, randomUUID()]) {
      const res = await put(id);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Product not found",
        code: "PRODUCT_NOT_FOUND",
      });
    }
    const bad = await put("nope");
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      success: false,
      message: "Invalid product ID",
      code: "INVALID_PRODUCT_ID",
    });
  });

  it("caps a wishlist at 200", async () => {
    const tee = await product();
    await db.query(
      `INSERT INTO products (name, slug, images, image_public_ids)
       SELECT 'P' || i, 'p-' || i, '{}', '{}' FROM generate_series(1, 200) i`,
    );
    await db.query(
      "INSERT INTO wishlist_items (user_id, product_id) SELECT $1, id FROM products WHERE slug LIKE 'p-%'",
      [user.id],
    );
    const res = await put(tee.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Your wishlist is full (200 items)",
      code: "WISHLIST_FULL",
    });
  });

  it("removes a product, saved or not", async () => {
    const tee = await product();
    await put(tee.id);
    for (let i = 0; i < 2; i++) {
      const res = await http()
        .delete(`/api/v1/wishlist/${tee.id}`)
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "Removed from your wishlist",
      });
    }
    expect(
      (await http().get("/api/v1/wishlist/ids").set("Cookie", cookie)).body
        .data,
    ).toEqual([]);
    expect(
      (await http().delete("/api/v1/wishlist/x").set("Cookie", cookie)).body
        .code,
    ).toBe("INVALID_PRODUCT_ID");
  });

  it("checks the page", async () => {
    for (const q of ["?page=0", "?page=2", "?page=x"]) {
      const res = await http()
        .get(`/api/v1/wishlist${q}`)
        .set("Cookie", cookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_PAGE_PARAMETER");
    }
  });
});

describe("review helpers", () => {
  it("summarises per-star counts", () => {
    expect(
      summarise([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
        { rating: 1, count: 1 },
      ]),
    ).toEqual({
      average: 3.8,
      count: 4,
      distribution: [1, 0, 0, 1, 2],
    });
    expect(summarise([])).toEqual({
      average: 0,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    });
    // an out-of-range star (the DB check forbids it) is ignored
    expect(summarise([{ rating: 9, count: 3 }]).count).toBe(0);
  });

  it.each([
    ["Ada Lovelace", "Ada L."],
    ["  Grace  Brewster Hopper ", "Grace H."],
    ["Cher", "Cher"],
    ["", "A customer"],
    ["सुप्रिम खत्री", "सुप्रिम ख."],
    ["ada lovelace", "ada L."],
  ])("displayName(%j) is %j", (name, want) => {
    expect(displayName(name)).toBe(want);
  });
});

const review = { rating: 4, title: "  Soft  ", body: " Fits well. " };
const reviews = (slug: string) => `/api/v1/products/${slug}/reviews`;
const rating = async (id: string) =>
  (
    await db.query(
      "SELECT rating_count, rating_avg FROM products WHERE id = $1",
      [id],
    )
  ).rows[0];

describe("PUT /products/:slug/reviews", () => {
  it("needs a signed-in verified buyer", async () => {
    const tee = await product();
    expect((await http().put(reviews(tee.slug)).send(review)).status).toBe(401);
    await buy(user, tee.id, "pending");
    const res = await http()
      .put(reviews(tee.slug))
      .set("Cookie", cookie)
      .send(review);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: "Only customers who bought this product can review it",
      code: "NOT_VERIFIED_BUYER",
    });
  });

  it("writes, then edits, the user's one review and updates the rating", async () => {
    const tee = await product();
    await buy(user, tee.id, "delivered");
    const res = await http()
      .put(reviews(tee.slug))
      .set("Cookie", cookie)
      .send(review);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Review saved",
      data: {
        id: expect.any(String),
        product_id: tee.id,
        user_id: user.id,
        rating: 4,
        title: "Soft",
        body: "Fits well.",
        status: "published",
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    });
    expect(await rating(tee.id)).toEqual({ rating_count: 1, rating_avg: 4 });

    await db.query("UPDATE reviews SET status = 'hidden'");
    const edit = await http()
      .put(reviews(tee.slug))
      .set("Cookie", cookie)
      .send({ ...review, rating: 2 });
    expect(edit.body.data).toMatchObject({
      id: res.body.data.id,
      rating: 2,
      status: "hidden",
    });
    expect(await rating(tee.id)).toEqual({ rating_count: 0, rating_avg: 0 });
  });

  it("404s a product not on sale, after checking the body", async () => {
    const off = await product("Off", { active: false });
    const res = await http()
      .put(reviews(off.slug))
      .set("Cookie", cookie)
      .send(review);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Product not found",
      code: "PRODUCT_NOT_FOUND",
    });
    expect(
      (await http().put(reviews(off.slug)).set("Cookie", cookie).send({}))
        .status,
    ).toBe(400);
  });

  it("validates the body as Go did", async () => {
    const tee = await product();
    const send = (body: object) =>
      http().put(reviews(tee.slug)).set("Cookie", cookie).send(body);
    let res = await send({ rating: 0, title: "   ", body: "" });
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "REQUIRED_FIELD",
          field: "rating",
          message: "Rating is required",
        },
        {
          code: "REQUIRED_FIELD",
          field: "title",
          message: "Title is required",
        },
        { code: "REQUIRED_FIELD", field: "body", message: "Body is required" },
      ],
    });
    // 100 characters of two UTF-16 units each fit
    res = await send({
      rating: 6,
      title: "😀".repeat(100),
      body: "x".repeat(2001),
    });
    expect(res.body.errors).toEqual([
      {
        code: "OUT_OF_RANGE",
        field: "rating",
        message: "Rating must be at most 5",
      },
      {
        code: "TOO_LONG",
        field: "body",
        message: "Body cannot exceed 2000 characters",
      },
    ]);
    res = await send({ ...review, title: "x".repeat(101) });
    expect(res.body.errors).toEqual([
      {
        code: "TOO_LONG",
        field: "title",
        message: "Title cannot exceed 100 characters",
      },
    ]);
    res = await send({ ...review, rating: 4.5 });
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_TYPE",
        field: "rating",
        message: "Rating must be a whole number",
      },
    ]);
  });
});

describe("GET /products/:slug/reviews", () => {
  it("lists published reviews with a summary, publicly", async () => {
    const tee = await product();
    const authors = [
      ["Ada Lovelace", 5, "published"],
      ["Grace Hopper", 4, "published"],
      ["Mallory", 1, "hidden"],
    ] as const;
    for (const [name, stars, status] of authors) {
      const u = await makeUser(db, { name });
      await db.query(
        "INSERT INTO reviews (product_id, user_id, rating, title, body, status, created_at) VALUES ($1, $2, $3::int, 't', 'b', $4, now() - $3::int * interval '1 minute')",
        [tee.id, u.id, stars, status],
      );
    }
    const res = await http().get(reviews(tee.slug));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Reviews fetched",
      data: {
        summary: { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] },
        reviews: [
          {
            id: expect.any(String),
            rating: 4,
            title: "t",
            body: "b",
            author: "Grace H.",
            created_at: expect.any(String),
            updated_at: expect.any(String),
          },
          expect.objectContaining({ rating: 5, author: "Ada L." }),
        ],
      },
      meta: { total: 2, total_pages: 1, page: 1, limit: 10, offset: 0 },
    });
  });

  it("is empty without reviews and 404s an unknown product", async () => {
    const tee = await product();
    const res = await http().get(reviews(tee.slug));
    expect(res.body.data).toEqual({
      summary: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] },
      reviews: [],
    });
    expect(res.body.meta.total_pages).toBe(0);
    const missing = await http().get(reviews("nope"));
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("PRODUCT_NOT_FOUND");
    // the page is checked first
    expect((await http().get(`${reviews("nope")}?page=0`)).body.code).toBe(
      "INVALID_PAGE_PARAMETER",
    );
    expect((await http().get(`${reviews(tee.slug)}?page=2`)).body.code).toBe(
      "INVALID_PAGE_PARAMETER",
    );
  });
});

describe("GET /products/:slug/reviews/mine", () => {
  it("tells whether the user may review, and their review", async () => {
    const tee = await product();
    expect((await http().get(`${reviews(tee.slug)}/mine`)).status).toBe(401);
    let res = await http()
      .get(`${reviews(tee.slug)}/mine`)
      .set("Cookie", cookie);
    expect(res.body).toEqual({
      success: true,
      message: "Review fetched",
      data: { can_review: false, review: null },
    });
    await buy(user, tee.id, "shipped");
    await http().put(reviews(tee.slug)).set("Cookie", cookie).send(review);
    res = await http()
      .get(`${reviews(tee.slug)}/mine`)
      .set("Cookie", cookie);
    expect(res.body.data).toMatchObject({
      can_review: true,
      review: { rating: 4, title: "Soft", status: "published" },
    });
    expect(
      (
        await http()
          .get(`${reviews("nope")}/mine`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(404);
  });
});

describe("DELETE /products/:slug/reviews", () => {
  it("deletes the user's review and refreshes the rating", async () => {
    const tee = await product();
    await buy(user, tee.id);
    await http().put(reviews(tee.slug)).set("Cookie", cookie).send(review);
    let res = await http().delete(reviews(tee.slug)).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Review deleted" });
    expect(await rating(tee.id)).toEqual({ rating_count: 0, rating_avg: 0 });
    res = await http().delete(reviews(tee.slug)).set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "You haven't reviewed this product",
      code: "REVIEW_NOT_FOUND",
    });
  });
});

describe("admin reviews", () => {
  let admin = "";
  let tee: Awaited<ReturnType<typeof product>>;
  let ids: string[] = [];
  beforeEach(async () => {
    admin = cookieFor(cfg, await makeUser(db, { role: "admin" }));
    tee = await product("Tee");
    ids = [];
    for (const [stars, status] of [
      [5, "published"],
      [3, "published"],
      [1, "hidden"],
    ] as const) {
      const u = await makeUser(db, {
        name: `Buyer ${stars}`,
        email: `b${stars}@example.com`,
      });
      const { rows } = await db.query<{ id: string }>(
        "INSERT INTO reviews (product_id, user_id, rating, title, body, status, created_at) VALUES ($1, $2, $3::int, 't', 'b', $4, now() - $3::int * interval '1 minute') RETURNING id",
        [tee.id, u.id, stars, status],
      );
      ids.push(rows[0]!.id);
    }
  });

  it("is for admins only", async () => {
    expect(
      (await http().get("/api/v1/admin/reviews").set("Cookie", cookie)).status,
    ).toBe(403);
    expect((await http().get("/api/v1/admin/reviews")).status).toBe(401);
  });

  it("lists every review, newest first, with filters", async () => {
    let res = await http().get("/api/v1/admin/reviews").set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Reviews fetched");
    expect(res.body.meta).toEqual({
      total: 3,
      total_pages: 1,
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(res.body.data.map((r: { rating: number }) => r.rating)).toEqual([
      1, 3, 5,
    ]);
    expect(res.body.data[0]).toEqual({
      id: ids[2],
      rating: 1,
      title: "t",
      body: "b",
      status: "hidden",
      created_at: expect.any(String),
      updated_at: expect.any(String),
      product_id: tee.id,
      product_name: "Tee",
      product_slug: tee.slug,
      author_name: "Buyer 1",
      author_email: "b1@example.com",
    });
    res = await http()
      .get("/api/v1/admin/reviews?status=published&rating=%2B3")
      .set("Cookie", admin);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([ids[1]]);
    res = await http()
      .get("/api/v1/admin/reviews?rating=2")
      .set("Cookie", admin);
    expect(res.body).toMatchObject({
      data: [],
      meta: { total: 0, total_pages: 0 },
    });
  });

  it("refuses bad filters", async () => {
    for (const [q, message] of [
      ["status=gone", "status must be published or hidden"],
      ["rating=0", "rating must be 1 to 5"],
      ["rating=x", "rating must be 1 to 5"],
      ["rating=2.5", "rating must be 1 to 5"],
    ]) {
      const res = await http()
        .get(`/api/v1/admin/reviews?${q}`)
        .set("Cookie", admin);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        message,
        code: "INVALID_QUERY_PARAMETER",
      });
    }
  });

  it("hides and publishes a review; the rating follows", async () => {
    const status = (id: string, body: object) =>
      http()
        .put(`/api/v1/admin/reviews/${id}/status`)
        .set("Cookie", admin)
        .send(body);
    await db.query("SELECT refresh_product_rating($1)", [tee.id]);
    expect(await rating(tee.id)).toEqual({ rating_count: 2, rating_avg: 4 });

    let res = await status(ids[0]!, { status: "hidden" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Review hidden",
      data: { id: ids[0], status: "hidden", author_email: "b5@example.com" },
    });
    expect(await rating(tee.id)).toEqual({ rating_count: 1, rating_avg: 3 });

    res = await status(ids[2]!.toUpperCase(), { status: " published " });
    expect(res.body).toMatchObject({
      message: "Review published",
      data: { status: "published" },
    });
    expect(await rating(tee.id)).toEqual({ rating_count: 2, rating_avg: 2 });
  });

  it("validates the id and body, and 404s an unknown review", async () => {
    const status = (id: string, body: object) =>
      http()
        .put(`/api/v1/admin/reviews/${id}/status`)
        .set("Cookie", admin)
        .send(body);
    let res = await status("nope", { status: "hidden" });
    expect(res.body).toEqual({
      success: false,
      message: "Invalid review ID",
      code: "INVALID_REVIEW_ID",
    });
    res = await status(randomUUID(), { status: "hidden" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Review not found",
      code: "REVIEW_NOT_FOUND",
    });
    res = await status(ids[0]!, { status: "" });
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "status",
        message: "Status is required",
      },
    ]);
    res = await status(ids[0]!, { status: "gone" });
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_VALUE",
        field: "status",
        message: "Status must be one of: published, hidden",
      },
    ]);
  });
});
