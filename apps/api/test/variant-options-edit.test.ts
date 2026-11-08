import { describe, expect, it } from "vitest";
import { makeVariant, setupCheckoutApp } from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const { http, db, cfg } = setupCheckoutApp();

const IMG = "https://res.cloudinary.com/x/image/upload/a.jpg";
const body = (properties?: unknown) => ({
  images: [IMG],
  image_public_ids: ["a"],
  selling_price: 2500,
  is_default: false,
  is_active: true,
  ...(properties !== undefined && { properties }),
});

describe("PUT variant: options", () => {
  it("changes a variant's size and colour, and refuses a clash", async () => {
    const admin = cookieFor(cfg, await makeUser(db, { role: "admin" }));
    const { product, variant } = await makeVariant(db);
    const url = `/api/v1/admin/products/${product.id}/variants`;

    let res = await http()
      .put(`${url}/${variant.id}`)
      .set("Cookie", admin)
      .send(
        body([
          { name: "Size", value: "L", type: "text" },
          { name: "Color", value: "Black", type: "color" },
        ]),
      );
    expect(res.status).toBe(200);
    expect(res.body.data.option_combination_key).toBe("Color=Black|Size=L");

    const list = await http().get(url).set("Cookie", admin);
    expect(list.body.data[0].options).toEqual([
      { name: "Color", value: "Black", type: "color" },
      { name: "Size", value: "L", type: "text" },
    ]);

    // Leaving properties out keeps them.
    res = await http()
      .put(`${url}/${variant.id}`)
      .set("Cookie", admin)
      .send(body());
    expect(res.body.data.option_combination_key).toBe("Color=Black|Size=L");

    const other = await http()
      .post(url)
      .set("Cookie", admin)
      .send({
        ...body([{ name: "Size", value: "M", type: "text" }]),
        stock: 1,
      });
    expect(other.status).toBe(201);
    res = await http()
      .put(`${url}/${other.body.data.id}`)
      .set("Cookie", admin)
      .send(
        body([
          { name: "Size", value: "L", type: "text" },
          { name: "Color", value: "Black", type: "color" },
        ]),
      );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VARIANT_ALREADY_EXISTS");
  });
});
