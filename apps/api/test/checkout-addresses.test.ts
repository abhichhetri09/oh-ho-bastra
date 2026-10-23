import { beforeEach, describe, expect, it } from "vitest";
import { createAddress, type User } from "../src/db/gen";
import { setupCheckoutApp } from "./checkout-helpers";
import { cookieFor, makeUser } from "./helpers";

const { http, db, cfg } = setupCheckoutApp();

let user: User;
let cookie = "";
beforeEach(async () => {
  user = await makeUser(db);
  cookie = cookieFor(cfg, user);
});

const save = (userId: string, line1: string, isDefault = false) =>
  createAddress(db, {
    user_id: userId,
    full_name: "Ada Lovelace",
    phone: "5550100",
    line1,
    line2: null,
    city: "London",
    region: null,
    postal_code: "SW1A 1AA",
    country: "GB",
    is_default: isDefault,
  }).then((a) => a!);

describe("GET /addresses", () => {
  it("is [] without addresses", async () => {
    const res = await http().get("/api/v1/addresses").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "Addresses fetched",
      data: [],
    });
  });

  it("lists the default first, then the newest, only the user's", async () => {
    const a = await save(user.id, "1 Old St", true);
    const b = await save(user.id, "2 New St");
    await save((await makeUser(db)).id, "elsewhere");
    const res = await http().get("/api/v1/addresses").set("Cookie", cookie);
    expect(res.body.data.map((x: { id: string }) => x.id)).toEqual([
      a.id,
      b.id,
    ]);
    expect(Object.keys(res.body.data[0])).toEqual([
      "id",
      "user_id",
      "full_name",
      "phone",
      "line1",
      "line2",
      "city",
      "region",
      "postal_code",
      "country",
      "created_at",
      "is_default",
    ]);
    expect(res.body.data[0]).toMatchObject({
      line2: null,
      region: null,
      is_default: true,
    });
  });
});

describe("DELETE /addresses/:addressID", () => {
  it("deletes the user's address", async () => {
    const a = await save(user.id, "1 Main St");
    const res = await http()
      .delete(`/api/v1/addresses/${a.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Address deleted" });
    expect(
      (await db.query("SELECT count(*)::int AS n FROM addresses")).rows[0].n,
    ).toBe(0);
  });

  it("is 404 for another user's address", async () => {
    const a = await save((await makeUser(db)).id, "1 Main St");
    const res = await http()
      .delete(`/api/v1/addresses/${a.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Address not found",
      code: "ADDRESS_NOT_FOUND",
    });
  });

  it("refuses a bad id", async () => {
    const res = await http()
      .delete("/api/v1/addresses/nope")
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid address ID",
      code: "INVALID_ADDRESS_ID",
    });
  });
});

describe("PUT /addresses/:addressID/default", () => {
  it("makes one address the default and unmarks the old one", async () => {
    const a = await save(user.id, "1 Main St", true);
    const b = await save(user.id, "2 Main St");
    const res = await http()
      .put(`/api/v1/addresses/${b.id}/default`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Default address updated");
    expect(res.body.data).toMatchObject({ id: b.id, is_default: true });
    const { rows } = await db.query(
      "SELECT id FROM addresses WHERE is_default",
    );
    expect(rows).toEqual([{ id: b.id }]);

    // Again is a no-op.
    expect(
      (
        await http()
          .put(`/api/v1/addresses/${b.id}/default`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(200);
    expect(
      (await db.query("SELECT is_default FROM addresses WHERE id = $1", [a.id]))
        .rows[0].is_default,
    ).toBe(false);
  });

  it("is 404 for another user's address and keeps the current default", async () => {
    const mine = await save(user.id, "1 Main St", true);
    const theirs = await save((await makeUser(db)).id, "2 Main St");
    const res = await http()
      .put(`/api/v1/addresses/${theirs.id}/default`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ADDRESS_NOT_FOUND");
    expect(
      (
        await db.query("SELECT is_default FROM addresses WHERE id = $1", [
          mine.id,
        ])
      ).rows[0].is_default,
    ).toBe(true);
  });

  it("refuses a bad id", async () => {
    const res = await http()
      .put("/api/v1/addresses/nope/default")
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ADDRESS_ID");
  });
});
