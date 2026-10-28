import { beforeEach, describe, expect, it } from "vitest";
import {
  createCategory,
  createProduct,
  createProductVariant,
  createSubCategory,
  getProductVariant,
  type Product,
  type ProductVariant,
} from "../src/db/gen";
import { setupTestApp, signIn } from "./helpers";

const { http, db, cfg } = setupTestApp();

const IMG =
  "https://res.cloudinary.com/test-cloud/image/upload/v1/ohhobastra/products/";
const SALE = "/api/v1/admin/products/sale";
const END = "/api/v1/admin/products/sale/end";
const MISSING = "00000000-0000-0000-0000-000000000001";

let admin = "";
let tees = "";
let longSleeve = "";
let custom = "";
beforeEach(async () => {
  admin = (await signIn(db, cfg, "admin")).cookie;
  tees = (await createCategory(db, { name: "Tees", slug: "tees" }))!.id;
  longSleeve = (await createSubCategory(db, {
    name: "Long sleeve",
    slug: "long-sleeve",
    parent_id: tees,
  }))!.id;
  custom = (await createCategory(db, { name: "Custom", slug: "custom" }))!.id;
});

async function makeProduct(category: string, slug: string): Promise<Product> {
  return (await createProduct(db, {
    name: slug,
    slug,
    category_id: category,
    description: "A thick tee",
    features: [],
    images: [`${IMG}a.jpg`],
    image_public_ids: ["ohhobastra/products/a"],
    is_active: true,
    is_featured: false,
  }))!;
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
    option_combination_key: `k-${Math.random()}`,
    ...over,
  }).then((v) => v!);

const reload = async (v: ProductVariant) =>
  (await getProductVariant(db, { id: v.id, product_id: v.product_id }))!;

const putOnSale = (body: Record<string, unknown>, cookie = admin) =>
  http().post(SALE).set("Cookie", cookie).send(body);

const endSale = (body: Record<string, unknown>, cookie = admin) =>
  http().post(END).set("Cookie", cookie).send(body);

describe("access", () => {
  it("needs a signed-in admin", async () => {
    const body = { target: { all: true }, percent_off: 10 };
    expect((await http().post(SALE).send(body)).status).toBe(401);
    expect((await http().post(END).send(body)).status).toBe(401);
    const customer = (await signIn(db, cfg)).cookie;
    for (const res of [
      await putOnSale(body, customer),
      await endSale(body, customer),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });
});

describe("POST /admin/products/sale", () => {
  it("takes percent_off off every variant, rounded to the cent", async () => {
    const p = await makeProduct(tees, "tee");
    const a = await makeVariant(p.id, {
      selling_price: 2500,
      is_default: true,
    });
    const b = await makeVariant(p.id, {
      selling_price: 2999,
      is_active: false,
    });
    const c = await makeVariant(p.id, { selling_price: 1005 });

    const res = await putOnSale({
      target: { product_ids: [p.id] },
      percent_off: 15,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Products put on sale",
      data: { products: 1, variants: 3 },
    });
    // 2125, 2549.15 → 2549, 854.25 → 854
    expect((await reload(a)).offer_price).toBe(2125);
    expect((await reload(b)).offer_price).toBe(2549);
    expect((await reload(c)).offer_price).toBe(854);
    expect((await reload(a)).offer_expires_at).toBeNull();
  });

  it("rounds half up, and skips prices too low to discount", async () => {
    const p = await makeProduct(tees, "tee");
    const half = await makeVariant(p.id, { selling_price: 250 }); // 237.5
    const one = await makeVariant(p.id, { selling_price: 1 }); // 0.9 → 1
    const two = await makeVariant(p.id, { selling_price: 2 }); // 0.2 → 0
    const res = await putOnSale({
      target: { product_ids: [p.id] },
      percent_off: 5,
    });
    expect(res.body.data).toEqual({ products: 1, variants: 1 });
    expect((await reload(half)).offer_price).toBe(238);
    expect((await reload(one)).offer_price).toBeNull();

    // 90% off 2 cents is 0.2, which rounds to nothing
    await putOnSale({ target: { product_ids: [p.id] }, percent_off: 90 });
    expect((await reload(two)).offer_price).toBeNull();
  });

  it("overrides an existing offer and sets the end", async () => {
    const p = await makeProduct(tees, "tee");
    const v = await makeVariant(p.id, {
      selling_price: 4000,
      offer_price: 3900,
      offer_expires_at: "2020-01-01T00:00:00Z",
    });
    const ends = new Date(Date.now() + 86_400_000).toISOString();
    const res = await putOnSale({
      target: { product_ids: [p.id] },
      percent_off: 25,
      ends_at: ends,
    });
    expect(res.status).toBe(200);
    const after = await reload(v);
    expect(after.offer_price).toBe(3000);
    expect(new Date(after.offer_expires_at!).toISOString()).toBe(ends);

    // null clears the end
    await putOnSale({
      target: { product_ids: [p.id] },
      percent_off: 50,
      ends_at: null,
    });
    expect(await reload(v)).toMatchObject({
      offer_price: 2000,
      offer_expires_at: null,
    });
  });

  it("targets only the listed products, counting the ones that exist", async () => {
    const p1 = await makeProduct(tees, "one");
    const p2 = await makeProduct(tees, "two");
    const v1 = await makeVariant(p1.id);
    const v2 = await makeVariant(p2.id);
    const res = await putOnSale({
      target: { product_ids: [p1.id.toUpperCase(), p1.id, MISSING] },
      percent_off: 10,
    });
    expect(res.body.data).toEqual({ products: 1, variants: 1 });
    expect((await reload(v1)).offer_price).toBe(2250);
    expect((await reload(v2)).offer_price).toBeNull();
  });

  it("targets a category, with or without its subcategories", async () => {
    const tee = await makeVariant((await makeProduct(tees, "tee")).id);
    const long = await makeVariant((await makeProduct(longSleeve, "long")).id);
    const print = await makeVariant((await makeProduct(custom, "print")).id);

    let res = await putOnSale({
      target: { category_id: tees, include_subcategories: false },
      percent_off: 20,
    });
    expect(res.body.data).toEqual({ products: 1, variants: 1 });
    expect((await reload(tee)).offer_price).toBe(2000);
    expect((await reload(long)).offer_price).toBeNull();

    res = await putOnSale({
      target: { category_id: tees, include_subcategories: true },
      percent_off: 40,
    });
    expect(res.body.data).toEqual({ products: 2, variants: 2 });
    expect((await reload(tee)).offer_price).toBe(1500);
    expect((await reload(long)).offer_price).toBe(1500);
    expect((await reload(print)).offer_price).toBeNull();
  });

  it("targets every product", async () => {
    const a = await makeVariant((await makeProduct(tees, "a")).id);
    const b = await makeVariant((await makeProduct(custom, "b")).id);
    const res = await putOnSale({ target: { all: true }, percent_off: 10 });
    expect(res.body.data).toEqual({ products: 2, variants: 2 });
    expect((await reload(a)).offer_price).toBe(2250);
    expect((await reload(b)).offer_price).toBe(2250);
  });

  it("is a 404 for an unknown category", async () => {
    const res = await putOnSale({
      target: { category_id: MISSING, include_subcategories: true },
      percent_off: 10,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Category not found",
      code: "CATEGORY_NOT_FOUND",
    });
  });

  it("shows on the storefront", async () => {
    const p = await makeProduct(tees, "tee");
    await makeVariant(p.id, { selling_price: 2500, is_default: true });
    await putOnSale({ target: { all: true }, percent_off: 20 });

    const page = await http().get("/api/v1/products/tee");
    expect(page.status).toBe(200);
    expect(page.body.data.variants[0]).toMatchObject({
      selling_price: 2500,
      offer_price: 2000,
      price: 2000,
    });
    const listing = await http().get("/api/v1/products");
    expect(listing.body.data.products[0]).toMatchObject({
      offer_price: 2000,
      price: 2000,
    });
  });

  it("validates the body", async () => {
    const cases: [Record<string, unknown>, unknown[]][] = [
      [
        { target: { all: true }, percent_off: 0 },
        [
          {
            code: "OUT_OF_RANGE",
            field: "percent_off",
            message: "Percent off must be at least 1",
          },
        ],
      ],
      [
        { target: { all: true }, percent_off: 91 },
        [
          {
            code: "OUT_OF_RANGE",
            field: "percent_off",
            message: "Percent off must be at most 90",
          },
        ],
      ],
      [
        { target: { all: true }, percent_off: 12.5 },
        [
          {
            code: "INVALID_TYPE",
            field: "percent_off",
            message: "Percent off must be a whole number",
          },
        ],
      ],
      [
        { target: { all: true } },
        [
          {
            code: "REQUIRED_FIELD",
            field: "percent_off",
            message: "Percent off is required",
          },
        ],
      ],
      [
        {
          target: { all: true },
          percent_off: 10,
          ends_at: "2020-01-01T00:00:00Z",
        },
        [
          {
            code: "OUT_OF_RANGE",
            field: "ends_at",
            message: "The sale must end in the future",
          },
        ],
      ],
      [
        { target: { all: true }, percent_off: 10, ends_at: "tomorrow" },
        [
          {
            code: "INVALID_DATE",
            field: "ends_at",
            message: "Ends at must be a valid date and time",
          },
        ],
      ],
      [
        { percent_off: 10 },
        [
          {
            code: "REQUIRED_FIELD",
            field: "target",
            message: "Target is required",
          },
        ],
      ],
      [
        { target: {}, percent_off: 10 },
        [
          {
            code: "INVALID_VALUE",
            field: "target",
            message: "Choose one target: product_ids, category_id or all",
          },
        ],
      ],
      [
        { target: { all: true, category_id: tees }, percent_off: 10 },
        [
          {
            code: "INVALID_VALUE",
            field: "target",
            message: "Choose one target: product_ids, category_id or all",
          },
        ],
      ],
      [
        { target: { all: false }, percent_off: 10 },
        [
          {
            code: "INVALID_VALUE",
            field: "target.all",
            message: "All must be one of: true",
          },
        ],
      ],
      [
        { target: { category_id: tees }, percent_off: 10 },
        [
          {
            code: "REQUIRED_FIELD",
            field: "target.include_subcategories",
            message: "Include subcategories is required",
          },
        ],
      ],
      [
        { target: { product_ids: [] }, percent_off: 10 },
        [
          {
            code: "TOO_SHORT",
            field: "target.product_ids",
            message: "Product IDs must have at least 1 item(s)",
          },
        ],
      ],
      [
        {
          target: { product_ids: Array.from({ length: 201 }, () => MISSING) },
          percent_off: 10,
        },
        [
          {
            code: "TOO_LONG",
            field: "target.product_ids",
            message: "Product IDs cannot have more than 200 item(s)",
          },
        ],
      ],
      [
        { target: { product_ids: [MISSING, "nope"] }, percent_off: 10 },
        [
          {
            code: "INVALID_UUID",
            field: "target.product_ids.1",
            message: "Product IDs must be a valid ID",
          },
        ],
      ],
    ];
    for (const [body, errors] of cases) {
      const res = await putOnSale(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors, JSON.stringify(body)).toEqual(errors);
    }
  });
});

describe("POST /admin/products/sale/end", () => {
  it("clears the offers of the target's variants", async () => {
    const p = await makeProduct(tees, "tee");
    const onSale = await makeVariant(p.id, {
      offer_price: 2000,
      offer_expires_at: "2099-01-01T00:00:00Z",
    });
    const expired = await makeVariant(p.id, {
      offer_price: 2000,
      offer_expires_at: "2020-01-01T00:00:00Z",
    });
    const plain = await makeVariant(p.id);
    const other = await makeVariant((await makeProduct(custom, "print")).id, {
      offer_price: 2000,
    });

    const res = await endSale({
      target: { category_id: tees, include_subcategories: true },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Sale ended",
      data: { products: 1, variants: 2 },
    });
    for (const v of [onSale, expired, plain]) {
      expect(await reload(v)).toMatchObject({
        offer_price: null,
        offer_expires_at: null,
      });
    }
    expect((await reload(other)).offer_price).toBe(2000);
  });

  it("ends a sale on listed products and on all of them", async () => {
    const a = await makeProduct(tees, "a");
    const b = await makeProduct(longSleeve, "b");
    const va = await makeVariant(a.id);
    const vb = await makeVariant(b.id);
    await putOnSale({ target: { all: true }, percent_off: 30 });

    let res = await endSale({ target: { product_ids: [a.id] } });
    expect(res.body.data).toEqual({ products: 1, variants: 1 });
    expect((await reload(va)).offer_price).toBeNull();
    expect((await reload(vb)).offer_price).toBe(1750);

    res = await endSale({ target: { all: true } });
    expect(res.body.data).toEqual({ products: 1, variants: 1 });
    expect((await reload(vb)).offer_price).toBeNull();
  });

  it("is a 404 for an unknown category and validates the target", async () => {
    let res = await endSale({
      target: { category_id: MISSING, include_subcategories: false },
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CATEGORY_NOT_FOUND");

    res = await endSale({ target: { product_ids: ["nope"] } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        code: "INVALID_UUID",
        field: "target.product_ids.0",
        message: "Product IDs must be a valid ID",
      },
    ]);
  });
});
