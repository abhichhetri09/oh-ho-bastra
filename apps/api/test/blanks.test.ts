import { beforeEach, describe, expect, it } from "vitest";
import { createBlank, type User } from "../src/db/gen";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
  stockOf,
} from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const { http, db, cfg, payments, service } = setupCheckoutApp();

let user: User;
let admin = "";
beforeEach(async () => {
  payments.reset();
  user = await makeUser(db);
  admin = cookieFor(cfg, await makeUser(db, { role: "admin" }));
});

const blankStock = async (id: string) =>
  (await db.query("SELECT stock FROM blanks WHERE id = $1", [id])).rows[0]
    .stock as number;

const link = (variantId: string, blankId: string | null) =>
  db.query("UPDATE product_variants SET blank_id = $2 WHERE id = $1", [
    variantId,
    blankId,
  ]);

/** Two prints (separate products) on one blank of `stock`. */
async function twoPrints(stock: number) {
  const blank = (await createBlank(db, {
    name: `Tee Black M ${Math.random()}`,
    stock,
  }))!;
  const a = (await makeVariant(db, { name: "Mountain", stock: 99 })).variant;
  const b = (await makeVariant(db, { name: "Logo", stock: 3 })).variant;
  await link(a.id, blank.id);
  await link(b.id, blank.id);
  return { blank, a, b };
}

describe("blank stock", () => {
  it("a linked variant takes the blank's count", async () => {
    const { a, b } = await twoPrints(10);
    expect(await stockOf(db, a.id)).toBe(10);
    expect(await stockOf(db, b.id)).toBe(10);
  });

  it("selling one print takes from every print on the blank", async () => {
    const { blank, a, b } = await twoPrints(10);
    await addToCart(db, user.id, a.id, 2);
    await service.start(user.id, { address: ADDRESS });
    expect(await blankStock(blank.id)).toBe(8);
    expect(await stockOf(db, a.id)).toBe(8);
    expect(await stockOf(db, b.id)).toBe(8);
  });

  it("two prints in one bag are taken together", async () => {
    const { blank, a, b } = await twoPrints(10);
    await addToCart(db, user.id, a.id, 2);
    await addToCart(db, user.id, b.id, 3);
    await service.start(user.id, { address: ADDRESS });
    expect(await blankStock(blank.id)).toBe(5);
    expect(await stockOf(db, a.id)).toBe(5);
    expect(await stockOf(db, b.id)).toBe(5);
  });

  it("refuses a bag whose prints together need more than the blank", async () => {
    const { blank, a, b } = await twoPrints(3);
    await addToCart(db, user.id, a.id, 2);
    await addToCart(db, user.id, b.id, 2);
    const cart = await http()
      .get("/api/v1/cart")
      .set("Cookie", cookieFor(cfg, user));
    expect(cart.body.data.has_issues).toBe(true);
    await expect(
      service.start(user.id, { address: ADDRESS }),
    ).rejects.toMatchObject({ code: "CART_HAS_ISSUES" });
    expect(await blankStock(blank.id)).toBe(3);
  });

  it("adding to the bag counts the bag's other prints on the blank", async () => {
    const { a, b } = await twoPrints(5);
    const shopper = cookieFor(cfg, user);
    const add = (variant_id: string, quantity: number) =>
      http()
        .post("/api/v1/cart/items")
        .set("Cookie", shopper)
        .send({ variant_id, quantity });
    expect((await add(a.id, 3)).status).toBe(200);
    expect((await add(b.id, 2)).status).toBe(200);
    const refused = await add(b.id, 1);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/shares stock with another item/);
    const cart = await http().get("/api/v1/cart").set("Cookie", shopper);
    const line = cart.body.data.items.find(
      (l: { variant_id: string }) => l.variant_id === b.id,
    );
    expect(line).toMatchObject({ blank_id: expect.any(String), stock: 2 });
  });

  it("cancelling an order puts the blank back", async () => {
    const { blank, a, b } = await twoPrints(10);
    await addToCart(db, user.id, a.id, 4);
    const { order_number } = await service.start(user.id, {
      address: ADDRESS,
    });
    await service.cancelPending(order_number);
    expect(await blankStock(blank.id)).toBe(10);
    expect(await stockOf(db, b.id)).toBe(10);
  });

  it("counting a linked variant counts the blank", async () => {
    const { blank, a, b } = await twoPrints(10);
    await db.query("UPDATE product_variants SET stock = 4 WHERE id = $1", [
      a.id,
    ]);
    expect(await blankStock(blank.id)).toBe(4);
    expect(await stockOf(db, b.id)).toBe(4);
  });

  it("a variant without a blank keeps its own count", async () => {
    const { a } = await twoPrints(10);
    const own = (await makeVariant(db, { stock: 7 })).variant;
    await addToCart(db, user.id, a.id, 1);
    await service.start(user.id, { address: ADDRESS });
    expect(await stockOf(db, own.id)).toBe(7);
  });

  it("unlinking keeps the count as the variant's own", async () => {
    const { blank, a, b } = await twoPrints(10);
    await link(a.id, null);
    await db.query("UPDATE product_variants SET stock = 2 WHERE id = $1", [
      a.id,
    ]);
    expect(await blankStock(blank.id)).toBe(10);
    expect(await stockOf(db, b.id)).toBe(10);
  });
});

describe("admin blanks API", () => {
  it("creates, counts (variants follow), and deletes", async () => {
    const created = await http()
      .post("/api/v1/admin/blanks")
      .set("Cookie", admin)
      .send({ name: "Plain tee White L", stock: 6 });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const v = (await makeVariant(db, { stock: 1 })).variant;
    const linked = await http()
      .put(`/api/v1/admin/products/${v.product_id}/variants/${v.id}`)
      .set("Cookie", admin)
      .send({
        images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
        image_public_ids: ["a"],
        selling_price: 2500,
        is_default: true,
        is_active: true,
        blank_id: id,
      });
    expect(linked.status).toBe(200);
    expect(linked.body.data.stock).toBe(6);

    const dup = await http()
      .post("/api/v1/admin/blanks")
      .set("Cookie", admin)
      .send({ name: "plain TEE white l", stock: 1 });
    expect(dup.status).toBe(409);

    const counted = await http()
      .put(`/api/v1/admin/blanks/${id}`)
      .set("Cookie", admin)
      .send({ name: "Plain tee White L", stock: 12 });
    expect(counted.status).toBe(200);
    expect(await stockOf(db, v.id)).toBe(12);

    const list = await http().get("/api/v1/admin/blanks").set("Cookie", admin);
    expect(
      list.body.data.find((b: { id: string }) => b.id === id).variant_count,
    ).toBe(1);

    const del = await http()
      .delete(`/api/v1/admin/blanks/${id}`)
      .set("Cookie", admin);
    expect(del.status).toBe(200);
    expect(await stockOf(db, v.id)).toBe(12);
  });

  it("refuses an unknown blank on a variant", async () => {
    const v = (await makeVariant(db)).variant;
    const res = await http()
      .put(`/api/v1/admin/products/${v.product_id}/variants/${v.id}`)
      .set("Cookie", admin)
      .send({
        images: ["https://res.cloudinary.com/x/image/upload/a.jpg"],
        image_public_ids: ["a"],
        selling_price: 2500,
        is_default: true,
        is_active: true,
        blank_id: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("BLANK_NOT_FOUND");
  });
});
