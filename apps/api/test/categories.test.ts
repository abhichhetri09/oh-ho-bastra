import { beforeEach, describe, expect, it } from "vitest";
import { createCategory, createSubCategory } from "../src/db/gen";
import { setupTestApp, signIn } from "./helpers";

const { http, db, cfg } = setupTestApp();

let admin = "";
beforeEach(async () => {
  admin = (await signIn(db, cfg, "admin")).cookie;
});

const root = (name: string, slug = name.toLowerCase()) =>
  createCategory(db, { name, slug });

describe("POST /admin/categories", () => {
  it("creates a root category with a slug", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Tees" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: "Category created",
      data: { name: "Tees", slug: "tees", parent_id: null },
    });
  });

  it("creates a subcategory under an existing parent", async () => {
    const parent = await root("Tees");
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Long sleeve", parent_id: parent!.id });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Subcategory created");
    expect(res.body.data).toMatchObject({
      slug: "long-sleeve",
      parent_id: parent!.id,
    });
  });

  it("treats an empty parent_id as none", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Custom", parent_id: "" });
    expect(res.status).toBe(201);
    expect(res.body.data.parent_id).toBeNull();
  });

  it("suffixes a slug that is taken", async () => {
    await root("Custom Prints", "tees");
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Tees" });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toMatch(/^tees-[a-z0-9]{7}$/);
  });

  it("refuses a duplicate name", async () => {
    await root("Tees");
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Tees" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CATEGORY_ALREADY_EXISTS");
  });

  it("validates the name", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [
        {
          code: "TOO_SHORT",
          field: "name",
          message: "Name must be at least 2 characters",
        },
      ],
    });
  });

  it("reports a missing name as required", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { code: "REQUIRED_FIELD", field: "name", message: "Name is required" },
    ]);
  });

  it("rejects a malformed parent id", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({ name: "Tees", parent_id: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({
      code: "INVALID_UUID",
      field: "parent_id",
    });
  });

  it("404s an unknown parent", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", admin)
      .send({
        name: "Tees",
        parent_id: "00000000-0000-4000-8000-000000000000",
      });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "CATEGORY_NOT_FOUND",
      message: "Parent category not found",
    });
  });

  it("is for admins only", async () => {
    const customer = (await signIn(db, cfg)).cookie;
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Cookie", customer)
      .send({ name: "Tees" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    const anon = await http()
      .post("/api/v1/admin/categories")
      .send({ name: "Tees" });
    expect(anon.status).toBe(401);
    expect(anon.body.code).toBe("MISSING_ACCESS_TOKEN");
  });
});

describe("PUT /admin/categories/:id", () => {
  it("renames, keeping the slug while the name still matches it", async () => {
    const tees = await root("Tees");
    const same = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({ name: "TEES" });
    expect(same.status).toBe(200);
    expect(same.body.data).toMatchObject({ name: "TEES", slug: "tees" });
    const renamed = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({ name: "Short sleeve" });
    expect(renamed.body).toMatchObject({
      message: "Category updated",
      data: { slug: "short-sleeve" },
    });
  });

  it("moves under a parent, and an omitted parent makes it a root again", async () => {
    const tees = await root("Tees");
    const long = await root("Long sleeve", "long-sleeve");
    const moved = await http()
      .put(`/api/v1/admin/categories/${long!.id}`)
      .set("Cookie", admin)
      .send({ name: "Long sleeve", parent_id: tees!.id });
    expect(moved.body.data.parent_id).toBe(tees!.id);
    const back = await http()
      .put(`/api/v1/admin/categories/${long!.id}`)
      .set("Cookie", admin)
      .send({ name: "Long sleeve" });
    expect(back.body.data.parent_id).toBeNull();
  });

  it("refuses itself as its parent", async () => {
    const tees = await root("Tees");
    const res = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({ name: "Tees", parent_id: tees!.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SELF_REFERENCING_CATEGORY");
  });

  it("refuses a move that would make a cycle", async () => {
    const tees = await root("Tees");
    const sub = await createSubCategory(db, {
      name: "Short sleeve",
      slug: "short-sleeve",
      parent_id: tees!.id,
    });
    const res = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({ name: "Tees", parent_id: sub!.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CYCLIC_CATEGORY_REFERENCE");
  });

  it("404s an unknown category or parent", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const res = await http()
      .put(`/api/v1/admin/categories/${missing}`)
      .set("Cookie", admin)
      .send({ name: "Tees" });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Category not found");
    const tees = await root("Tees");
    const parent = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({ name: "Tees", parent_id: missing });
    expect(parent.status).toBe(404);
    expect(parent.body.message).toBe("Parent category not found");
  });

  it("refuses a name another category has", async () => {
    await root("Tees");
    const custom = await root("Custom");
    const res = await http()
      .put(`/api/v1/admin/categories/${custom!.id}`)
      .set("Cookie", admin)
      .send({ name: "Tees" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CATEGORY_ALREADY_EXISTS");
  });

  it("checks the id before the body", async () => {
    const res = await http()
      .put("/api/v1/admin/categories/not-a-uuid")
      .set("Cookie", admin)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "INVALID_CATEGORY_ID",
      message: "Invalid category ID",
    });
  });

  it("validates the body", async () => {
    const tees = await root("Tees");
    const res = await http()
      .put(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { code: "REQUIRED_FIELD", field: "name", message: "Name is required" },
    ]);
  });
});

describe("DELETE /admin/categories/:id", () => {
  it("deletes, then 404s", async () => {
    const tees = await root("Tees");
    const res = await http()
      .delete(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Category deleted" });
    const again = await http()
      .delete(`/api/v1/admin/categories/${tees!.id}`)
      .set("Cookie", admin);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("CATEGORY_NOT_FOUND");
  });

  it("rejects a malformed id", async () => {
    const res = await http()
      .delete("/api/v1/admin/categories/123")
      .set("Cookie", admin);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CATEGORY_ID");
  });
});

describe("GET /admin/categories", () => {
  it("pages newest first, with meta", async () => {
    for (let i = 0; i < 21; i++) await root(`Category ${i}`, `category-${i}`);
    const first = await http()
      .get("/api/v1/admin/categories")
      .set("Cookie", admin);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(20);
    expect(first.body.data[0].name).toBe("Category 20");
    expect(first.body.meta).toEqual({
      total: 21,
      total_pages: 2,
      page: 1,
      limit: 20,
      offset: 0,
    });
    const second = await http()
      .get("/api/v1/admin/categories?page=2")
      .set("Cookie", admin);
    expect(second.body.data).toHaveLength(1);
  });

  it("has an empty first page and rejects pages past the end", async () => {
    const empty = await http()
      .get("/api/v1/admin/categories")
      .set("Cookie", admin);
    expect(empty.body).toMatchObject({
      data: [],
      meta: { total: 0, total_pages: 0, page: 1 },
    });
    for (const page of ["2", "0", "abc"]) {
      const res = await http()
        .get(`/api/v1/admin/categories?page=${page}`)
        .set("Cookie", admin);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_PAGE_PARAMETER");
    }
  });
});

describe("GET /categories", () => {
  it("lists the tree with depths, parents first", async () => {
    const tees = await root("Tees");
    await createSubCategory(db, {
      name: "Short sleeve",
      slug: "short-sleeve",
      parent_id: tees!.id,
    });
    await root("Custom");
    const res = await http().get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(
      res.body.data.map((c: { name: string; depth: number }) => [
        c.name,
        c.depth,
      ]),
    ).toEqual([
      ["Custom", 0],
      ["Tees", 0],
      ["Short sleeve", 1],
    ]);
  });

  it("is an empty array with no categories", async () => {
    const res = await http().get("/api/v1/categories");
    expect(res.body).toEqual({
      success: true,
      message: "Categories fetched",
      data: [],
    });
  });
});
