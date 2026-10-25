import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseListingQuery,
  parseOptions,
  parsePrice,
  searchTerms,
} from "../src/catalog/listing-query";
import { setupTestApp } from "./helpers";

const { http, db } = setupTestApp();

// ---- seeding --------------------------------------------------------------

async function category(
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO categories (name, slug, parent_id) VALUES ($1, $2, $3) RETURNING id",
    [name, name.toLowerCase().replaceAll(" ", "-"), parentId],
  );
  return rows[0]!.id;
}

async function optionValue(
  productId: string,
  name: string,
  value: string,
): Promise<string> {
  const type = name === "color" ? "color" : "text";
  const { rows: opt } = await db.query<{ id: string }>(
    `INSERT INTO product_options (product_id, name, type) VALUES ($1, $2, $3)
     ON CONFLICT (product_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [productId, name, type],
  );
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO product_option_values (option_id, value) VALUES ($1, $2)
     ON CONFLICT (option_id, value) DO UPDATE SET value = EXCLUDED.value RETURNING id`,
    [opt[0]!.id, value],
  );
  return rows[0]!.id;
}

interface VariantFields {
  price?: number;
  offer?: number | null;
  offerExpiresAt?: Date | null;
  stock?: number;
  isDefault?: boolean;
  active?: boolean;
  options?: Record<string, string>;
  createdAt?: Date;
  sku?: string | null;
}

async function variant(
  productId: string,
  f: VariantFields = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO product_variants
       (product_id, sku, stock, images, image_public_ids, selling_price, offer_price, offer_expires_at,
        is_default, is_active, option_combination_key, created_at)
     VALUES ($1, $2, $3, '{}', '{}', $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      productId,
      f.sku ?? null,
      f.stock ?? 5,
      f.price ?? 1000,
      f.offer ?? null,
      f.offerExpiresAt ?? null,
      f.isDefault ?? false,
      f.active ?? true,
      randomUUID(),
      f.createdAt ?? new Date(),
    ],
  );
  const id = rows[0]!.id;
  for (const [name, value] of Object.entries(f.options ?? {})) {
    await db.query(
      "INSERT INTO variant_option_values (variant_id, option_value_id) VALUES ($1, $2)",
      [id, await optionValue(productId, name, value)],
    );
  }
  return id;
}

interface ProductFields extends VariantFields {
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  features?: string[];
  featured?: boolean;
  productActive?: boolean;
}

/** A product with its default variant. */
async function product(
  name: string,
  f: ProductFields = {},
): Promise<{ id: string; variantId: string }> {
  const created = f.createdAt ?? new Date();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products
       (name, slug, category_id, description, features, images, image_public_ids, is_active, is_featured, created_at)
     VALUES ($1, $2, $3, $4, $5, '{https://img/1.jpg}', '{p1}', $6, $7, $8) RETURNING id`,
    [
      name,
      f.slug ?? name.toLowerCase().replaceAll(" ", "-"),
      f.categoryId ?? null,
      f.description ?? null,
      f.features ?? [],
      f.productActive ?? true,
      f.featured ?? false,
      created,
    ],
  );
  const id = rows[0]!.id;
  const variantId = await variant(id, {
    ...f,
    isDefault: true,
    createdAt: created,
  });
  return { id, variantId };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const slugs = (body: { data: { products: { slug: string }[] } }) =>
  body.data.products.map((p) => p.slug);

// ---- query parsing (port of listing_test.go, which checked the params) ----

function parse(qs: Record<string, string | string[]>) {
  let status = 0;
  let body: unknown;
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: unknown) {
      body = b;
      return this;
    },
  } as unknown as Response;
  const q = parseListingQuery({ query: qs } as unknown as Request, res);
  return { q, status, body };
}

describe("parseListingQuery", () => {
  it("reads every filter; duplicate options are dropped and stay paired", () => {
    const { q } = parse({
      page: "2",
      sort: "price_desc",
      featured: "true",
      price_min: "100",
      price_max: "5000",
      option: ["size:M", "color:Black", "size:M", "size:L"],
    });
    expect(q).toEqual({
      page: 2,
      sort: "price_desc",
      searchTerms: [],
      featured: true,
      priceMin: 100,
      priceMax: 5000,
      optionNames: ["size", "color", "size"],
      optionValues: ["M", "Black", "L"],
    });
  });

  it("defaults to the first page, newest, no filters", () => {
    expect(parse({}).q).toEqual({
      page: 1,
      sort: "newest",
      searchTerms: [],
      featured: false,
      priceMin: 0,
      priceMax: 0,
      optionNames: [],
      optionValues: [],
    });
  });

  it.each([
    [
      "words are lowercased, deduplicated and split on punctuation",
      "Linen  SHIRT linen t-shirt!!",
      {},
      ["linen", "shirt", "t"],
      "relevance",
    ],
    [
      "an explicit sort wins over relevance",
      "linen",
      { sort: "price_asc" },
      ["linen"],
      "price_asc",
    ],
    [
      "relevance without a search falls back to newest",
      "",
      { sort: "relevance" },
      [],
      "newest",
    ],
    [
      "a search without letters or digits has no terms",
      "%% --",
      {},
      [],
      "newest",
    ],
    [
      "combining marks stay inside a word",
      "नेपाली टोपी",
      {},
      ["नेपाली", "टोपी"],
      "relevance",
    ],
    [
      "at most 8 terms",
      "a b c d e f g h i j",
      {},
      ["a", "b", "c", "d", "e", "f", "g", "h"],
      "relevance",
    ],
    [
      "exactly 100 characters is allowed",
      "a".repeat(100),
      {},
      ["a".repeat(100)],
      "relevance",
    ],
  ])("search: %s", (_name, search, extra, terms, sort) => {
    const { q, status } = parse({ q: search, ...extra });
    expect(status).toBe(0);
    expect(q?.searchTerms).toEqual(terms);
    expect(q?.sort).toBe(sort);
  });

  it("lowercases rune by rune, like Go", () => {
    expect(searchTerms("ΟΔΟΣ İstanbul")).toEqual(["οδοσ", "istanbul"]);
  });

  it("reads prices as Go's Atoi did", () => {
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("+15")).toBe(15);
    expect(parsePrice("007")).toBe(7);
    expect(parsePrice("100000000")).toBe(100_000_000);
    for (const bad of [
      "-1",
      "1.5",
      "1e3",
      " 5",
      "abc",
      "100000001",
      "99999999999999999999",
      "+",
    ]) {
      expect(parsePrice(bad), bad).toBeNull();
    }
  });

  it("trims option parts and checks their length in characters", () => {
    expect(parseOptions([" size : M "])).toEqual({
      names: ["size"],
      values: ["M"],
    });
    expect(parseOptions(["note:a:b"])).toEqual({
      names: ["note"],
      values: ["a:b"],
    });
    expect(parseOptions(["ä".repeat(20) + ":x"])).not.toBeNull();
    expect(parseOptions([" :x"])).toBeNull();
    expect(
      parseOptions(Array.from({ length: 20 }, (_, i) => `n${i}:v`)),
    ).not.toBeNull();
    expect(parseOptions(Array.from({ length: 21 }, () => "size:M"))).toBeNull();
  });
});

// ---- GET /products ----------------------------------------------------------

describe("GET /products", () => {
  it("filters, sorts and paginates; facets ignore price and options", async () => {
    // 26 featured products that match every filter
    for (let i = 0; i < 26; i++) {
      await product(`Match ${i}`, {
        featured: true,
        price: 1000 + i,
        options: { size: i % 2 ? "M" : "L", color: "Black" },
        createdAt: minutesAgo(i),
      });
    }
    await product("White Tee", {
      featured: true,
      price: 1500,
      options: { size: "M", color: "White" },
    });
    await product("Pricey Tee", {
      featured: true,
      price: 9000,
      options: { size: "M", color: "Black" },
    });
    await product("Plain Tee", {
      featured: false,
      price: 1500,
      options: { size: "M", color: "Black" },
    });
    await product("Hidden Tee", {
      featured: true,
      productActive: false,
      price: 1500,
      options: { size: "M" },
    });

    const res = await http().get(
      "/api/v1/products?page=2&sort=price_desc&featured=true&price_min=100&price_max=5000" +
        "&option=size:M&option=color:Black&option=size:M&option=size:L",
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Products fetched");
    expect(slugs(res.body)).toEqual(["match-1", "match-0"]);
    expect(res.body.meta).toEqual({
      total: 26,
      total_pages: 2,
      page: 2,
      limit: 24,
      offset: 24,
    });
    // featured scope only: White and Pricey count, Plain and Hidden don't
    expect(res.body.data.price_range).toEqual({
      min_price: 1000,
      max_price: 9000,
    });
    expect(res.body.data.filter_options).toEqual([
      { option_name: "color", option_value: "Black", option_type: "color" },
      { option_name: "color", option_value: "White", option_type: "color" },
      { option_name: "size", option_value: "L", option_type: "text" },
      { option_name: "size", option_value: "M", option_type: "text" },
    ]);
  });

  it("sends each product as its storefront row", async () => {
    const { id, variantId } = await product("Polo", { price: 2900, stock: 0 });
    const res = await http().get("/api/v1/products");
    expect(res.status).toBe(200);
    const [p] = res.body.data.products;
    expect(Object.keys(p).sort()).toEqual(
      [
        "id",
        "name",
        "slug",
        "category_id",
        "description",
        "features",
        "images",
        "image_public_ids",
        "is_active",
        "is_featured",
        "created_at",
        "updated_at",
        "rating_count",
        "rating_avg",
        "variant_id",
        "selling_price",
        "offer_price",
        "price",
        "in_stock",
      ].sort(),
    );
    expect(p).toMatchObject({
      id,
      variant_id: variantId,
      name: "Polo",
      category_id: null,
      description: null,
      features: [],
      images: ["https://img/1.jpg"],
      rating_count: 0,
      rating_avg: 0,
      selling_price: 2900,
      offer_price: null,
      price: 2900,
      in_stock: false,
    });
  });

  it("filters on the live price, offers included", async () => {
    await product("On Offer", { price: 5000, offer: 1500 });
    await product("Expired Offer", {
      price: 5000,
      offer: 1500,
      offerExpiresAt: minutesAgo(1),
    });
    const res = await http().get("/api/v1/products?price_max=2000");
    expect(slugs(res.body)).toEqual(["on-offer"]);
    expect(res.body.data.products[0]).toMatchObject({
      selling_price: 5000,
      offer_price: 1500,
      price: 1500,
    });
  });

  it("sends empty lists and a zero range when nothing matches", async () => {
    const res = await http().get("/api/v1/products");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Products fetched",
      data: {
        products: [],
        filter_options: [],
        price_range: { min_price: 0, max_price: 0 },
      },
      meta: { total: 0, total_pages: 0, page: 1, limit: 24, offset: 0 },
    });
  });

  it("rejects a page past the last one", async () => {
    await product("Polo");
    const res = await http().get("/api/v1/products?page=2");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      code: "INVALID_PAGE_PARAMETER",
      message: "Invalid page parameter",
    });
  });

  it("matches option filters per variant, any value of a name", async () => {
    const shirt = await product("Shirt", {
      options: { size: "S", color: "Red" },
    });
    await variant(shirt.id, { options: { size: "L", color: "Blue" } });
    await variant(shirt.id, {
      active: false,
      options: { size: "XL", color: "Red" },
    });
    await product("Other", { options: { size: "XL", color: "Red" } });

    const get = async (qs: string) =>
      slugs((await http().get(`/api/v1/products?${qs}`)).body);
    expect(await get("option=size:L&option=color:Blue")).toEqual(["shirt"]);
    // no single variant is L and Red
    expect(await get("option=size:L&option=color:Red")).toEqual([]);
    // the inactive XL variant doesn't count
    expect(await get("option=size:XL")).toEqual(["other"]);
    expect((await get("option=size:S&option=size:L")).sort()).toEqual([
      "shirt",
    ]);
  });

  it("searches names, descriptions and categories, by relevance", async () => {
    const shoes = await category("Shoes");
    await product("Linen Shirt", { createdAt: minutesAgo(5) });
    await product("Cotton Tee", {
      description: "Feels like linen",
      createdAt: minutesAgo(1),
    });
    await product("Black Runner", { categoryId: shoes });
    await product("The Tote");

    const get = async (qs: string) =>
      slugs((await http().get(`/api/v1/products?${qs}`)).body);
    // the name match ranks first although it is older
    expect(await get("q=linen")).toEqual(["linen-shirt", "cotton-tee"]);
    expect(await get("q=linen&sort=newest")).toEqual([
      "cotton-tee",
      "linen-shirt",
    ]);
    expect(await get("q=black+shoes")).toEqual(["black-runner"]);
    expect(await get("q=the")).toEqual(["the-tote"]);
    expect(await get("q=lin")).toEqual(["linen-shirt", "cotton-tee"]);
    // a search of punctuation only lists everything
    expect((await get("q=%25%25+--")).length).toBe(4);
  });

  it("scopes the facets and price range to the search", async () => {
    await product("Linen Shirt", { price: 3000, options: { size: "M" } });
    await product("Wool Coat", { price: 9000, options: { size: "XL" } });
    const res = await http().get("/api/v1/products?q=linen");
    expect(res.body.data.price_range).toEqual({
      min_price: 3000,
      max_price: 3000,
    });
    expect(res.body.data.filter_options).toEqual([
      { option_name: "size", option_value: "M", option_type: "text" },
    ]);
  });

  it("lists featured products only when asked", async () => {
    await product("Star", { featured: true });
    await product("Plain");
    expect(
      slugs((await http().get("/api/v1/products?featured=true")).body),
    ).toEqual(["star"]);
    expect(
      (await http().get("/api/v1/products?featured=false")).body.meta.total,
    ).toBe(2);
    expect(
      (await http().get("/api/v1/products?featured=")).body.meta.total,
    ).toBe(2);
  });

  it("hides inactive products and products without an active default variant", async () => {
    await product("Visible");
    await product("Off", { productActive: false });
    await product("No Default", { active: false });
    expect(slugs((await http().get("/api/v1/products")).body)).toEqual([
      "visible",
    ]);
  });

  it.each([
    [
      "sort=cheapest",
      "INVALID_QUERY_PARAMETER",
      "sort must be one of: relevance, newest, price_asc, price_desc",
    ],
    [
      "sort=",
      "INVALID_QUERY_PARAMETER",
      "sort must be one of: relevance, newest, price_asc, price_desc",
    ],
    [
      "sort=Newest",
      "INVALID_QUERY_PARAMETER",
      "sort must be one of: relevance, newest, price_asc, price_desc",
    ],
    [
      "featured=yes",
      "INVALID_QUERY_PARAMETER",
      "featured must be true or false",
    ],
    [
      "featured=TRUE",
      "INVALID_QUERY_PARAMETER",
      "featured must be true or false",
    ],
    ["price_min=-1", "INVALID_PRICE_FILTER", "Invalid price filter"],
    ["price_min=12.5", "INVALID_PRICE_FILTER", "Invalid price filter"],
    ["price_max=100000001", "INVALID_PRICE_FILTER", "Invalid price filter"],
    [
      "price_min=500&price_max=100",
      "INVALID_PRICE_FILTER",
      "Invalid price filter",
    ],
    [
      "option=size",
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    ],
    [
      "option=:M",
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    ],
    [
      "option=size:",
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    ],
    [
      "option=size:+",
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    ],
    [
      "option=abcdefghijklmnopqrstu:M",
      "INVALID_QUERY_PARAMETER",
      "option must be name:value (at most 20)",
    ],
    [
      "q=" + "a".repeat(101),
      "INVALID_QUERY_PARAMETER",
      "q must be at most 100 characters",
    ],
    ["page=0", "INVALID_PAGE_PARAMETER", "Invalid page parameter"],
    ["page=x", "INVALID_PAGE_PARAMETER", "Invalid page parameter"],
    // page is checked first, then q, sort, featured, price and options
    ["page=0&sort=bad", "INVALID_PAGE_PARAMETER", "Invalid page parameter"],
    [
      "sort=bad&featured=bad",
      "INVALID_QUERY_PARAMETER",
      "sort must be one of: relevance, newest, price_asc, price_desc",
    ],
    ["price_min=x&option=bad", "INVALID_PRICE_FILTER", "Invalid price filter"],
  ])("rejects %s", async (qs, code, message) => {
    await product("Polo");
    const res = await http().get(`/api/v1/products?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, code, message });
  });

  it("accepts a lower bound alone and equal bounds", async () => {
    await product("Polo", { price: 500 });
    expect(
      (await http().get("/api/v1/products?price_min=500&price_max=500")).body
        .meta.total,
    ).toBe(1);
    expect(
      (await http().get("/api/v1/products?price_min=501")).body.meta.total,
    ).toBe(0);
    expect(
      (await http().get("/api/v1/products?price_min=500&price_max=0")).body.meta
        .total,
    ).toBe(1);
  });
});

// ---- GET /categories/:slug --------------------------------------------------

describe("GET /categories/:slug", () => {
  it("lists the category and its subcategories, facets scoped to them", async () => {
    const shoes = await category("Shoes");
    const boots = await category("Boots", shoes);
    const tees = await category("Tees");
    await product("Runner", {
      categoryId: shoes,
      price: 4000,
      options: { size: "42" },
      createdAt: minutesAgo(2),
    });
    await product("Hiker", {
      categoryId: boots,
      price: 8000,
      options: { size: "44" },
      createdAt: minutesAgo(1),
    });
    await product("Polo", {
      categoryId: tees,
      price: 2000,
      options: { size: "M" },
    });

    const res = await http().get("/api/v1/categories/shoes?option=size:42");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Products fetched");
    expect(slugs(res.body)).toEqual(["runner"]);
    expect(
      res.body.data.filter_options.map(
        (o: { option_value: string }) => o.option_value,
      ),
    ).toEqual(["42", "44"]);
    expect(res.body.data.price_range).toEqual({
      min_price: 4000,
      max_price: 8000,
    });

    expect(slugs((await http().get("/api/v1/categories/shoes")).body)).toEqual([
      "hiker",
      "runner",
    ]);
    expect(slugs((await http().get("/api/v1/categories/boots")).body)).toEqual([
      "hiker",
    ]);
  });

  it("404s an unknown category before reading the query", async () => {
    const res = await http().get("/api/v1/categories/nope?sort=bad");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      code: "CATEGORY_NOT_FOUND",
      message: "Category not found",
    });
  });

  it("validates the query of a known category", async () => {
    await category("Shoes");
    const res = await http().get("/api/v1/categories/shoes?featured=1");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_QUERY_PARAMETER");
  });
});

// ---- GET /products/:productSlug ---------------------------------------------

describe("GET /products/:productSlug", () => {
  it("sends the product with its default variant, variants and related products", async () => {
    const tees = await category("Tees");
    const polo = await product("Polo", {
      categoryId: tees,
      description: "Soft",
      features: ["Cotton"],
      price: 2900,
      stock: 7,
      sku: "POLO-S",
      options: { size: "S", color: "Navy" },
      createdAt: minutesAgo(10),
    });
    const large = await variant(polo.id, {
      price: 3100,
      offer: 2500,
      offerExpiresAt: new Date(Date.now() + 86_400_000),
      options: { size: "L", color: "Navy" },
      createdAt: minutesAgo(5),
    });
    await variant(polo.id, {
      active: false,
      options: { size: "XL", color: "Navy" },
    });
    for (let i = 0; i < 9; i++)
      await product(`Tee ${i}`, { categoryId: tees, createdAt: minutesAgo(i) });
    await product("Hidden", { categoryId: tees, productActive: false });
    await product("Elsewhere");

    const res = await http().get("/api/v1/products/polo");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product fetched");
    const { product_detail, variants, related_products } = res.body.data;
    expect(Object.keys(res.body.data).sort()).toEqual([
      "product_detail",
      "related_products",
      "variants",
    ]);
    expect(product_detail).toMatchObject({
      id: polo.id,
      variant_id: polo.variantId,
      slug: "polo",
      category_id: tees,
      description: "Soft",
      features: ["Cotton"],
      price: 2900,
      offer_price: null,
      in_stock: true,
      stock: 7,
      variant_images: [],
    });

    expect(variants.map((v: { id: string }) => v.id)).toEqual([
      polo.variantId,
      large,
    ]);
    expect(Object.keys(variants[0]).sort()).toEqual(
      [
        "id",
        "product_id",
        "sku",
        "stock",
        "images",
        "selling_price",
        "offer_price",
        "price",
        "offer_expires_at",
        "is_default",
        "created_at",
        "options",
      ].sort(),
    );
    expect(variants[0]).toMatchObject({
      sku: "POLO-S",
      is_default: true,
      offer_price: null,
      offer_expires_at: null,
      options: [
        { name: "color", value: "Navy", type: "color" },
        { name: "size", value: "S", type: "text" },
      ],
    });
    expect(variants[1]).toMatchObject({
      sku: null,
      selling_price: 3100,
      offer_price: 2500,
      price: 2500,
    });
    expect(typeof variants[1].offer_expires_at).toBe("string");

    // newest first, at most 8, visible and in the same category only
    expect(related_products.map((p: { slug: string }) => p.slug)).toEqual([
      "tee-0",
      "tee-1",
      "tee-2",
      "tee-3",
      "tee-4",
      "tee-5",
      "tee-6",
      "tee-7",
    ]);
  });

  it("sends empty related products and an empty options list", async () => {
    await product("Solo");
    const res = await http().get("/api/v1/products/solo");
    expect(res.status).toBe(200);
    expect(res.body.data.related_products).toEqual([]);
    expect(res.body.data.variants[0].options).toEqual([]);
  });

  it("404s an unknown or hidden product", async () => {
    await product("Off", { productActive: false });
    for (const slug of ["nope", "off"]) {
      const res = await http().get(`/api/v1/products/${slug}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });
    }
  });
});

// ---- GET /settings ------------------------------------------------------------

describe("GET /settings", () => {
  beforeEach(async () => {
    // the test reset empties every table, the seeded settings row too
    await db.query("INSERT INTO store_settings DEFAULT VALUES");
  });

  it("sends the theme and the banner messages", async () => {
    const res = await http().get("/api/v1/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Store settings fetched",
      data: {
        theme: "editorial",
        announcements: [
          "Free shipping on orders over €60",
          "30-day returns, no questions asked",
          "Custom prints: send your art or a line of type",
        ],
        announcements_enabled: true,
        business_name: "",
        business_id: "",
        business_address: "",
        business_email: "",
        business_phone: "",
        updated_at: expect.any(String),
      },
    });
  });

  it("is a 500 without the settings row", async () => {
    await db.query("DELETE FROM store_settings");
    const res = await http().get("/api/v1/settings");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process request",
    });
  });
});
