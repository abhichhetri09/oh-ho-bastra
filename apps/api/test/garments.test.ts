import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createBlank, createProduct } from "../src/db/gen";
import { makeVariant, setupCheckoutApp } from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const { http, db, cfg } = setupCheckoutApp();

let admin = "";
beforeEach(async () => {
  admin = cookieFor(cfg, await makeUser(db, { role: "admin" }));
});

const garmentBody = (garment: string, colours = ["Black", "White"]) => ({
  garment,
  options: [
    { name: "Colour", type: "color", values: colours },
    { name: "Size", type: "text", values: ["S", "M", "L"] },
  ],
  price: 2500,
  stock: 4,
});

const saveGarment = (body: unknown) =>
  http().post("/api/v1/admin/blanks/garments").set("Cookie", admin).send(body);

async function printProduct() {
  return (await createProduct(db, {
    name: "Mountain",
    slug: `mountain-${randomUUID().slice(0, 8)}`,
    category_id: null,
    description: null,
    features: [],
    images: ["https://res.cloudinary.com/x/image/upload/m.jpg"],
    image_public_ids: ["m"],
    is_active: true,
    is_featured: false,
  }))!;
}

const generate = (productId: string, body: unknown) =>
  http()
    .post(`/api/v1/admin/products/${productId}/variants/generate`)
    .set("Cookie", admin)
    .send(body);

describe("garments", () => {
  it("makes one blank per colour and size, and adopts a blank of that name", async () => {
    const garment = `Tee ${randomUUID().slice(0, 6)}`;
    const old = (await createBlank(db, {
      name: `${garment}, Black, M`,
      stock: 9,
      price: null,
    }))!;

    const res = await saveGarment(garmentBody(garment));
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(6);
    expect(res.body.data[0].name).toBe(`${garment}, Black, S`);
    expect(res.body.data[0].options).toEqual([
      { name: "Colour", type: "color", value: "Black" },
      { name: "Size", type: "text", value: "S" },
    ]);
    const adopted = res.body.data.find((b: { id: string }) => b.id === old.id);
    expect(adopted).toMatchObject({ stock: 9, garment, price: 2500 });

    const list = await http()
      .get("/api/v1/admin/blanks/garments")
      .set("Cookie", admin);
    expect(list.body.data).toContainEqual({ garment, blank_count: 6 });
  });

  it("refuses more than 200 combinations", async () => {
    const values = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => `${p}${i}`);
    const res = await saveGarment({
      ...garmentBody("Huge"),
      options: [
        { name: "Colour", type: "color", values: values(30, "C") },
        { name: "Size", type: "text", values: values(7, "S") },
      ],
    });
    expect(res.status).toBe(400);
  });
});

describe("generate variants", () => {
  it("makes a variant per blank, linked, priced and with a default", async () => {
    const garment = `Tee ${randomUUID().slice(0, 6)}`;
    await saveGarment(garmentBody(garment));
    const product = await printProduct();

    const res = await generate(product.id, { garment });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ created: 6, skipped: 0 });

    const list = await http()
      .get(`/api/v1/admin/products/${product.id}/variants`)
      .set("Cookie", admin);
    const variants = list.body.data as {
      is_default: boolean;
      selling_price: number;
      stock: number;
      blank_id: string | null;
      images: string[];
    }[];
    expect(variants).toHaveLength(6);
    expect(variants.filter((v) => v.is_default)).toHaveLength(1);
    for (const v of variants) {
      expect(v).toMatchObject({ selling_price: 2500, stock: 4 });
      expect(v.blank_id).not.toBeNull();
      expect(v.images).toEqual(product.images);
    }
  });

  it("skips combinations the product has, and keeps its default", async () => {
    const garment = `Tee ${randomUUID().slice(0, 6)}`;
    await saveGarment(garmentBody(garment, ["Black"]));
    const { product } = await makeVariant(db);

    let res = await generate(product.id, { garment, selling_price: 3000 });
    expect(res.body.data).toEqual({ created: 3, skipped: 0 });
    // The garment gains a colour: only its new blanks are made.
    await saveGarment(garmentBody(garment, ["Black", "Navy"]));
    res = await generate(product.id, { garment, selling_price: 3000 });
    expect(res.body.data).toEqual({ created: 3, skipped: 3 });

    const { rows } = await db.query(
      "SELECT is_default, selling_price FROM product_variants WHERE product_id = $1",
      [product.id],
    );
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.is_default)).toHaveLength(1);
  });

  it("needs a price when a blank has none", async () => {
    const garment = `Tee ${randomUUID().slice(0, 6)}`;
    await createBlank(db, { name: `${garment} x`, stock: 1, price: null });
    await db.query("UPDATE blanks SET garment = $1 WHERE name = $2", [
      garment,
      `${garment} x`,
    ]);
    const product = await printProduct();
    const res = await generate(product.id, { garment });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe("selling_price");
  });

  it("404s an unknown garment", async () => {
    const product = await printProduct();
    const res = await generate(product.id, { garment: "Nope" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("GARMENT_NOT_FOUND");
  });
});
