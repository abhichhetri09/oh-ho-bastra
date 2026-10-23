import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCategory,
  createProduct,
  createProductVariant,
  getProductVariant,
  type Product,
} from "../src/db/gen";
import { fakeCloudinary, setupTestApp, signIn } from "./helpers";

const cloudinary = fakeCloudinary();
const { http, db, cfg } = setupTestApp({ cloudinary });

const IMG =
  "https://res.cloudinary.com/test-cloud/image/upload/v1/ohhobastra/products/";

let admin = "";
let categoryId = "";
beforeEach(async () => {
  admin = (await signIn(db, cfg, "admin")).cookie;
  categoryId = (await createCategory(db, { name: "Tees", slug: "tees" }))!.id;
  cloudinary.deleted.length = 0;
});

const productBody = (over: Record<string, unknown> = {}) => ({
  name: "Heavyweight Tee",
  images: [`${IMG}a.jpg`],
  image_public_ids: ["ohhobastra/products/a"],
  description: "A thick tee",
  category_id: categoryId,
  is_active: true,
  is_featured: false,
  ...over,
});

async function makeProduct(
  over: Partial<Parameters<typeof createProduct>[1]> = {},
): Promise<Product> {
  const p = await createProduct(db, {
    name: "Heavyweight Tee",
    slug: `tee-${Math.random().toString(36).slice(2, 8)}`,
    category_id: categoryId,
    description: "A thick tee",
    features: [],
    images: [`${IMG}a.jpg`],
    image_public_ids: ["ohhobastra/products/a"],
    is_active: true,
    is_featured: false,
    ...over,
  });
  return p!;
}

const makeVariant = (
  productId: string,
  over: Partial<Parameters<typeof createProductVariant>[1]> = {},
) =>
  createProductVariant(db, {
    product_id: productId,
    sku: `SKU-${Math.random().toString(36).slice(2, 10)}`,
    stock: 5,
    images: [`${IMG}v.jpg`],
    image_public_ids: ["ohhobastra/products/v"],
    selling_price: 2500,
    offer_price: null,
    offer_expires_at: null,
    is_default: false,
    is_active: true,
    option_combination_key: "",
    ...over,
  }).then((v) => v!);

const variantBody = (over: Record<string, unknown> = {}) => ({
  images: [`${IMG}v.jpg`],
  image_public_ids: ["ohhobastra/products/v"],
  stock: 10,
  selling_price: 2500,
  is_default: false,
  is_active: true,
  ...over,
});

describe("access", () => {
  it("needs a signed-in admin", async () => {
    const anon = await http().get("/api/v1/admin/products");
    expect(anon.status).toBe(401);
    const customer = (await signIn(db, cfg)).cookie;
    for (const [method, path] of [
      ["get", "/api/v1/admin/products"],
      [
        "post",
        "/api/v1/admin/products/00000000-0000-0000-0000-000000000000/variants",
      ],
      ["post", "/api/v1/admin/uploads/signature"],
    ] as const) {
      const res = await http()[method](path).set("Cookie", customer);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });
});

describe("POST /admin/products", () => {
  it("creates a product", async () => {
    const res = await http()
      .post("/api/v1/admin/products")
      .set("Cookie", admin)
      .send(productBody());
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Product created");
    expect(res.body.data).toMatchObject({
      name: "Heavyweight Tee",
      slug: "heavyweight-tee",
      category_id: categoryId,
      description: "A thick tee",
      features: [],
      is_active: true,
      is_featured: false,
      rating_count: 0,
      rating_avg: 0,
    });
  });

  it("trims fields and suffixes a taken slug", async () => {
    await makeProduct({ slug: "heavyweight-tee" });
    const res = await http()
      .post("/api/v1/admin/products")
      .set("Cookie", admin)
      .send(productBody({ name: "  Heavyweight Tee ", features: [" Soft "] }));
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Heavyweight Tee");
    expect(res.body.data.features).toEqual(["Soft"]);
    expect(res.body.data.slug).toMatch(/^heavyweight-tee-[a-z0-9]{7}$/);
  });

  it("is a 404 for an unknown category, even a non-RFC id", async () => {
    for (const id of [
      "9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f",
      "00000000-0000-0000-0000-000000000001",
    ]) {
      const res = await http()
        .post("/api/v1/admin/products")
        .set("Cookie", admin)
        .send(productBody({ category_id: id }));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: "Category not found",
        code: "CATEGORY_NOT_FOUND",
      });
    }
  });

  it("reports every invalid field, a length mismatch included", async () => {
    const res = await http()
      .post("/api/v1/admin/products")
      .set("Cookie", admin)
      .send(
        productBody({
          name: "x",
          image_public_ids: ["a", "b"],
          category_id: "nope",
        }),
      );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        {
          code: "TOO_SHORT",
          field: "name",
          message: "Name must be at least 2 characters",
        },
        {
          code: "LENGTH_MISMATCH",
          field: "image_public_ids",
          message: "Provide one public ID per image",
        },
        {
          code: "INVALID_UUID",
          field: "category_id",
          message: "Category must be a valid ID",
        },
      ]),
    );
    expect(res.body.errors).toHaveLength(3);
  });

  it("requires the flags", async () => {
    const { is_active: _, ...body } = productBody();
    const res = await http()
      .post("/api/v1/admin/products")
      .set("Cookie", admin)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "is_active",
        message: "Is active is required",
      },
    ]);
  });
});

describe("PUT /admin/products/:productID", () => {
  it("replaces the product and keeps its slug", async () => {
    const product = await makeProduct({ slug: "heavyweight-tee" });
    const res = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set("Cookie", admin)
      .send(
        productBody({
          name: "Heavyweight  Tee",
          is_active: false,
          features: ["Soft"],
        }),
      );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product updated");
    expect(res.body.data).toMatchObject({
      slug: "heavyweight-tee",
      is_active: false,
      features: ["Soft"],
    });
  });

  it("is a 404 for an unknown product and a 400 for a bad id", async () => {
    const missing = await http()
      .put("/api/v1/admin/products/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f")
      .set("Cookie", admin)
      .send(productBody());
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      success: false,
      message: "Product not found",
      code: "PRODUCT_NOT_FOUND",
    });
    const bad = await http()
      .put("/api/v1/admin/products/123")
      .set("Cookie", admin)
      .send(productBody());
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      success: false,
      message: "Invalid product ID",
      code: "INVALID_PRODUCT_ID",
    });
  });

  it("is a 404 when the category is gone", async () => {
    const product = await makeProduct();
    const res = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set("Cookie", admin)
      .send(
        productBody({ category_id: "9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f" }),
      );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("GET /admin/products", () => {
  it("lists products with their variant summary", async () => {
    const p = await makeProduct({ name: "Alpha Tee" });
    await makeVariant(p.id, {
      is_default: true,
      selling_price: 3000,
      stock: 2,
    });
    await makeVariant(p.id, { stock: 4, option_combination_key: "Size=M" });
    await makeProduct({
      name: "Beta Tee",
      category_id: null,
      is_active: false,
    });

    const res = await http()
      .get("/api/v1/admin/products?sort=name")
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Products fetched");
    expect(res.body.meta).toEqual({
      total: 2,
      total_pages: 1,
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(res.body.data.map((r: Product) => r.name)).toEqual([
      "Alpha Tee",
      "Beta Tee",
    ]);
    expect(res.body.data[0]).toMatchObject({
      category_name: "Tees",
      default_price: 3000,
      total_stock: 6,
      variant_count: 2,
    });
    expect(res.body.data[1]).toMatchObject({
      category_name: null,
      default_price: null,
      total_stock: 0,
      variant_count: 0,
    });
  });

  it("filters by name, status and category", async () => {
    await makeProduct({ name: "Alpha Tee" });
    await makeProduct({
      name: "Beta 100% Tee",
      is_active: false,
      category_id: null,
    });
    const get = (q: string) =>
      http().get(`/api/v1/admin/products?${q}`).set("Cookie", admin);
    expect((await get("q=alp")).body.data.map((r: Product) => r.name)).toEqual([
      "Alpha Tee",
    ]);
    expect(
      (await get("q=100%25")).body.data.map((r: Product) => r.name),
    ).toEqual(["Beta 100% Tee"]);
    expect(
      (await get("status=inactive")).body.data.map((r: Product) => r.name),
    ).toEqual(["Beta 100% Tee"]);
    expect(
      (await get("category=tees")).body.data.map((r: Product) => r.name),
    ).toEqual(["Alpha Tee"]);
    const none = await get("category=nope");
    expect(none.body.data).toEqual([]);
    expect(none.body.meta).toMatchObject({ total: 0, total_pages: 0 });
  });

  it("rejects bad query parameters", async () => {
    const get = (q: string) =>
      http().get(`/api/v1/admin/products?${q}`).set("Cookie", admin);
    expect((await get("status=all")).body).toEqual({
      success: false,
      message: "status must be active or inactive",
      code: "INVALID_QUERY_PARAMETER",
    });
    expect((await get(`q=${"x".repeat(101)}`)).body.message).toBe(
      "q must be at most 100 characters",
    );
    expect((await get("sort=nope")).body.message).toBe(
      "sort must be one of created, name, price, stock, updated",
    );
    const page = await get("page=2");
    expect(page.status).toBe(400);
    expect(page.body.code).toBe("INVALID_PAGE_PARAMETER");
  });
});

describe("GET /admin/products/:productID", () => {
  it("returns a product, inactive too", async () => {
    const p = await makeProduct({ is_active: false });
    const res = await http()
      .get(`/api/v1/admin/products/${p.id}`)
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product fetched");
    expect(res.body.data.id).toBe(p.id);
    const missing = await http()
      .get("/api/v1/admin/products/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f")
      .set("Cookie", admin);
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /admin/products/:productID", () => {
  it("deletes the product and only its own, unordered images", async () => {
    const p = await makeProduct({
      images: [
        `${IMG}a.jpg`,
        `${IMG}b.jpg`,
        "https://res.cloudinary.com/demo/image/upload/samples/d.jpg",
      ],
      image_public_ids: [
        "ohhobastra/products/a",
        "ohhobastra/products/b",
        "samples/d",
      ],
    });
    // a variant reusing the product's photo, and one shown on a past order
    await makeVariant(p.id, {
      images: [`${IMG}a.jpg`, `${IMG}c.jpg`],
      image_public_ids: ["ohhobastra/products/a", "ohhobastra/products/c"],
    });
    const { user } = await signIn(db, cfg);
    const order = await db.query<{ id: string }>(
      `INSERT INTO orders (user_id, subtotal, shipping, total, email, shipping_address, expires_at)
       VALUES ($1, 100, 0, 100, 'a@example.com', '{}', now()) RETURNING id`,
      [user.id],
    );
    await db.query(
      `INSERT INTO order_items (order_id, product_name, product_slug, image, unit_price, quantity, line_total)
       VALUES ($1, 'Tee', 'tee', $2, 100, 1, 100)`,
      [order.rows[0]!.id, `${IMG}c.jpg`],
    );

    const res = await http()
      .delete(`/api/v1/admin/products/${p.id}`)
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Product deleted" });
    await vi.waitFor(() =>
      expect(cloudinary.deleted).toEqual([
        "ohhobastra/products/a",
        "ohhobastra/products/b",
      ]),
    );

    const again = await http()
      .delete(`/api/v1/admin/products/${p.id}`)
      .set("Cookie", admin);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("GET /admin/products/:productID/variants", () => {
  it("lists every variant, default first, with sorted options", async () => {
    const p = await makeProduct();
    const create = (body: Record<string, unknown>) =>
      http()
        .post(`/api/v1/admin/products/${p.id}/variants`)
        .set("Cookie", admin)
        .send(variantBody(body));
    await create({
      is_active: false,
      properties: [{ name: "Size", value: "S", type: "text" }],
    });
    await create({
      is_default: true,
      properties: [
        { name: "Size", value: "M", type: "text" },
        { name: "Color", value: "Black", type: "color" },
      ],
    });

    const res = await http()
      .get(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Variants fetched");
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      is_default: true,
      option_combination_key: "Color=Black|Size=M",
      options: [
        { name: "Color", value: "Black", type: "color" },
        { name: "Size", value: "M", type: "text" },
      ],
    });
    expect(res.body.data[1]).toMatchObject({
      is_active: false,
      options: [{ name: "Size", value: "S", type: "text" }],
    });
  });

  it("gives [] for a product without variants and 404 for an unknown one", async () => {
    const p = await makeProduct();
    const empty = await http()
      .get(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin);
    expect(empty.body.data).toEqual([]);
    const missing = await http()
      .get(
        "/api/v1/admin/products/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f/variants",
      )
      .set("Cookie", admin);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("POST /admin/products/:productID/variants", () => {
  it("creates a variant with a SKU and its options", async () => {
    const p = await makeProduct();
    const res = await http()
      .post(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin)
      .send(
        variantBody({
          offer_price: 2000,
          offer_expires_at: "2030-01-01T00:00:00Z",
          properties: [
            { name: " Size ", value: "M", type: "text" },
            { name: "Color", value: "Black", type: "color" },
          ],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Variant created");
    expect(res.body.data).toMatchObject({
      product_id: p.id,
      stock: 10,
      selling_price: 2500,
      offer_price: 2000,
      offer_expires_at: "2030-01-01T00:00:00.000Z",
      option_combination_key: "Size=M|Color=Black".split("|").sort().join("|"),
      is_default: false,
    });
    expect(res.body.data.sku).toMatch(/^HEA-M-BLA-[0-9A-F]{8}-[0-9A-F]{4}$/);
  });

  it("drops an offer end without an offer, and keys a variant without options as empty", async () => {
    const p = await makeProduct();
    const res = await http()
      .post(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin)
      .send(variantBody({ offer_expires_at: "2030-01-01T00:00:00Z" }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      offer_price: null,
      offer_expires_at: null,
      option_combination_key: "",
    });
  });

  it("takes the default from the current one", async () => {
    const p = await makeProduct();
    const old = await makeVariant(p.id, { is_default: true });
    const res = await http()
      .post(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin)
      .send(
        variantBody({
          is_default: true,
          properties: [{ name: "Size", value: "L", type: "text" }],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.data.is_default).toBe(true);
    expect(
      (await getProductVariant(db, { id: old.id, product_id: p.id }))!
        .is_default,
    ).toBe(false);
  });

  it("refuses a combination that exists, and rolls back", async () => {
    const p = await makeProduct();
    const old = await makeVariant(p.id, {
      is_default: true,
      option_combination_key: "Size=M",
    });
    const res = await http()
      .post(`/api/v1/admin/products/${p.id}/variants`)
      .set("Cookie", admin)
      .send(
        variantBody({
          is_default: true,
          properties: [{ name: "Size", value: "M", type: "text" }],
        }),
      );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: "Variant with this combination already exists",
      code: "VARIANT_ALREADY_EXISTS",
    });
    expect(
      (await getProductVariant(db, { id: old.id, product_id: p.id }))!
        .is_default,
    ).toBe(true);
  });

  it("is a 404 for an unknown product", async () => {
    const res = await http()
      .post(
        "/api/v1/admin/products/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f/variants",
      )
      .set("Cookie", admin)
      .send(variantBody());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("validates like Go", async () => {
    const p = await makeProduct();
    const post = (body: Record<string, unknown>) =>
      http()
        .post(`/api/v1/admin/products/${p.id}/variants`)
        .set("Cookie", admin)
        .send(body);

    const zero = await post(variantBody({ selling_price: 0 }));
    expect(zero.body.errors).toEqual([
      {
        code: "REQUIRED_FIELD",
        field: "selling_price",
        message: "Selling price is required",
      },
    ]);

    const offer = await post(variantBody({ offer_price: 2500 }));
    expect(offer.body.errors).toEqual([
      {
        code: "OUT_OF_RANGE",
        field: "offer_price",
        message: "Offer price must be less than Selling price",
      },
    ]);

    const dupes = await post(
      variantBody({
        properties: [
          { name: "Size", value: "M", type: "text" },
          { name: "Size", value: "L", type: "text" },
        ],
      }),
    );
    expect(dupes.body.errors).toEqual([
      {
        code: "DUPLICATE_ITEM",
        field: "properties",
        message: "Properties must not contain duplicates",
      },
    ]);

    const many = await post(
      variantBody({ stock: -1, image_public_ids: ["a", "b"], images: [] }),
    );
    expect(many.status).toBe(400);
    expect(many.body.errors).toEqual([
      {
        code: "TOO_SHORT",
        field: "images",
        message: "Images must have at least 1 item(s)",
      },
      {
        code: "OUT_OF_RANGE",
        field: "stock",
        message: "Stock must be at least 0",
      },
      {
        code: "LENGTH_MISMATCH",
        field: "image_public_ids",
        message: "Provide one public ID per image",
      },
    ]);
  });
});

describe("PUT /admin/products/:productID/variants/:variantID", () => {
  it("updates prices and flags and takes over the default", async () => {
    const p = await makeProduct();
    const old = await makeVariant(p.id, { is_default: true });
    const v = await makeVariant(p.id, {
      option_combination_key: "Size=M",
      stock: 7,
    });
    const res = await http()
      .put(`/api/v1/admin/products/${p.id}/variants/${v.id}`)
      .set("Cookie", admin)
      .send(
        variantBody({
          selling_price: 4000,
          offer_price: 3000,
          is_default: true,
          stock: 99,
        }),
      );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Variant updated");
    // stock has its own endpoint, and the SKU is fixed
    expect(res.body.data).toMatchObject({
      selling_price: 4000,
      offer_price: 3000,
      is_default: true,
      stock: 7,
      sku: v.sku,
    });
    expect(
      (await getProductVariant(db, { id: old.id, product_id: p.id }))!
        .is_default,
    ).toBe(false);
  });

  it("is a 404 for an unknown variant, rolling back the default change", async () => {
    const p = await makeProduct();
    const old = await makeVariant(p.id, { is_default: true });
    const res = await http()
      .put(
        `/api/v1/admin/products/${p.id}/variants/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f`,
      )
      .set("Cookie", admin)
      .send(variantBody({ is_default: true }));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Variant not found",
      code: "VARIANT_NOT_FOUND",
    });
    expect(
      (await getProductVariant(db, { id: old.id, product_id: p.id }))!
        .is_default,
    ).toBe(true);
  });

  it("checks the variant id", async () => {
    const p = await makeProduct();
    const res = await http()
      .put(`/api/v1/admin/products/${p.id}/variants/x`)
      .set("Cookie", admin)
      .send(variantBody());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid variant ID",
      code: "INVALID_VARIANT_ID",
    });
  });
});

describe("variant get, delete and stock", () => {
  it("gets a variant of the product only", async () => {
    const p = await makeProduct();
    const other = await makeProduct();
    const v = await makeVariant(p.id);
    const res = await http()
      .get(`/api/v1/admin/products/${p.id}/variants/${v.id}`)
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Variant fetched");
    expect(res.body.data).toMatchObject({
      id: v.id,
      offer_price: null,
      offer_expires_at: null,
    });
    const wrong = await http()
      .get(`/api/v1/admin/products/${other.id}/variants/${v.id}`)
      .set("Cookie", admin);
    expect(wrong.status).toBe(404);
    expect(wrong.body.code).toBe("VARIANT_NOT_FOUND");
  });

  it("deletes a variant", async () => {
    const p = await makeProduct();
    const v = await makeVariant(p.id);
    const res = await http()
      .delete(`/api/v1/admin/products/${p.id}/variants/${v.id}`)
      .set("Cookie", admin);
    expect(res.body).toEqual({ success: true, message: "Variant deleted" });
    const again = await http()
      .delete(`/api/v1/admin/products/${p.id}/variants/${v.id}`)
      .set("Cookie", admin);
    expect(again.status).toBe(404);
  });

  it("sets the stock", async () => {
    const p = await makeProduct();
    const v = await makeVariant(p.id);
    const url = `/api/v1/admin/products/${p.id}/variants/${v.id}/stock`;
    const res = await http().put(url).set("Cookie", admin).send({ stock: 0 });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Stock updated");
    expect(res.body.data.stock).toBe(0);
    const bad = await http()
      .put(url)
      .set("Cookie", admin)
      .send({ stock: 10001 });
    expect(bad.body.errors).toEqual([
      {
        code: "OUT_OF_RANGE",
        field: "stock",
        message: "Stock must be at most 10000",
      },
    ]);
    const missing = await http()
      .put(
        `/api/v1/admin/products/${p.id}/variants/9b2f4c1e-7a3d-4e8b-9c6f-1a2b3c4d5e6f/stock`,
      )
      .set("Cookie", admin)
      .send({ stock: 1 });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("VARIANT_NOT_FOUND");
  });
});

describe("POST /admin/uploads/signature", () => {
  it("signs an upload into the product folder", async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await http()
      .post("/api/v1/admin/uploads/signature")
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Upload signed");
    expect(res.body.data).toMatchObject({
      folder: "ohhobastra/products",
      allowed_formats: "jpg,png,webp,avif",
    });
    expect(res.body.data.timestamp).toBeGreaterThanOrEqual(before);
  });
});
