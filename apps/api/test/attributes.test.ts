import { describe, expect, it } from "vitest";
import { cookieFor, makeUser, setupTestApp } from "./helpers";

const { http, db, cfg } = setupTestApp();

describe("admin option lists", () => {
  it("creates, saves, refuses a clash, deletes", async () => {
    const admin = cookieFor(cfg, await makeUser(db, { role: "admin" }));
    const url = "/api/v1/admin/attributes";

    let res = await http()
      .post(url)
      .set("Cookie", admin)
      .send({
        name: "Colour",
        type: "color",
        values: [{ value: "Black", hex: "#111111" }, { value: "White" }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Colour",
      type: "color",
      values: [
        { value: "Black", hex: "#111111" },
        { value: "White", hex: null },
      ],
    });

    res = await http()
      .post(url)
      .set("Cookie", admin)
      .send({ name: "Material", type: "text", values: [{ value: "Cotton" }] });
    expect(res.status).toBe(201);
    const id = res.body.data.id;

    res = await http()
      .put(`${url}/${id}`)
      .set("Cookie", admin)
      .send({
        name: "Material",
        type: "text",
        values: [{ value: "Linen" }, { value: "Cotton", hex: "#ffffff" }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.values).toMatchObject([
      { value: "Linen", hex: null },
      { value: "Cotton", hex: null },
    ]);

    res = await http()
      .post(url)
      .set("Cookie", admin)
      .send({ name: "colour", type: "text", values: [] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ATTRIBUTE_ALREADY_EXISTS");

    res = await http()
      .put(`${url}/${id}`)
      .set("Cookie", admin)
      .send({
        name: "Material",
        type: "text",
        values: [{ value: "A" }, { value: "a" }],
      });
    expect(res.status).toBe(400);

    res = await http().delete(`${url}/${id}`).set("Cookie", admin);
    expect(res.status).toBe(200);
  });

  it("is admin-only", async () => {
    const res = await http()
      .get("/api/v1/admin/attributes")
      .set("Cookie", cookieFor(cfg, await makeUser(db)));
    expect(res.status).toBe(403);
  });
});
