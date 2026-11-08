import { beforeEach, describe, expect, it } from "vitest";
import {
  ADDRESS,
  addToCart,
  makeVariant,
  setupCheckoutApp,
} from "./checkout-helpers";
import { makeUser } from "./helpers";

const ctx = setupCheckoutApp();
const { http, db, payments, service } = ctx;

beforeEach(() => payments.reset());

const product = async (name: string) => await makeVariant(db, { name });

/** A paid order of these variants, by a new customer. */
async function buy(...variantIds: string[]) {
  const user = await makeUser(db);
  for (const id of variantIds) await addToCart(db, user.id, id);
  const { order_number } = await service.start(user.id, { address: ADDRESS });
  const { rows } = await db.query(
    "SELECT stripe_session_id FROM orders WHERE number = $1",
    [order_number],
  );
  payments.pay(rows[0].stripe_session_id);
  await service.reconcile(rows[0].stripe_session_id);
}

const recs = (...ids: string[]) =>
  http().get(`/api/v1/recommendations?product_ids=${ids.join(",")}`);

const names = (res: { body: { data: { products: { name: string }[] } } }) =>
  res.body.data.products.map((p) => p.name).sort();

describe("GET /recommendations", () => {
  it("people also bought, from paid orders, leaving out the bag", async () => {
    const tee = await product("Tee");
    const cap = await product("Cap");
    const tote = await product("Tote");
    await product("Mug"); // never bought with the tee
    await buy(tee.variant.id, cap.variant.id);
    await buy(tee.variant.id, cap.variant.id, tote.variant.id);

    const res = await recs(tee.product.id);
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe("bought_together");
    // the cap was in two of the orders, the tote in one
    expect(res.body.data.products.map((p: { name: string }) => p.name)).toEqual(
      ["Cap", "Tote"],
    );

    // with the cap in the bag too, only one is left: not enough
    const more = await recs(tee.product.id, cap.product.id);
    expect(more.body.data.source).not.toBe("bought_together");
  });

  it("falls back to the same category, then to featured", async () => {
    const { rows } = await db.query(
      "INSERT INTO categories (name, slug) VALUES ('Tees', 'tees-rec') RETURNING id",
    );
    const inCat = async (name: string) => {
      const p = await product(name);
      await db.query("UPDATE products SET category_id = $2 WHERE id = $1", [
        p.product.id,
        rows[0].id,
      ]);
      return p;
    };
    const a = await inCat("A");
    await inCat("B");
    await inCat("C");
    const f1 = await product("F1");
    const f2 = await product("F2");
    await db.query(
      "UPDATE products SET is_featured = TRUE WHERE id = ANY($1)",
      [[f1.product.id, f2.product.id]],
    );

    let res = await recs(a.product.id);
    expect(res.body.data.source).toBe("similar");
    expect(names(res)).toEqual(["B", "C"]);

    res = await recs(f1.product.id);
    expect(res.body.data.source).toBe("featured");
    expect(names(res)).toEqual(["F2"]);

    res = await http().get("/api/v1/recommendations");
    expect(res.body.data.source).toBe("featured");
  });

  it("refuses ids that aren't uuids", async () => {
    const res = await recs("nope");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_QUERY_PARAMETER");
  });
});
