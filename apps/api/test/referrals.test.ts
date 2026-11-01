import { describe, expect, it } from "vitest";
import { setupCheckoutApp } from "./checkout-helpers";
import { cookieFor, makeUser, signIn } from "./helpers";

// The referral programme's settings: the rule in store_settings and the
// admin's endpoint for it. Nothing prices with it yet.

const { http, db, cfg } = setupCheckoutApp();

const DEFAULTS = {
  enabled: false,
  friend_kind: "amount",
  friend_value: 500,
  friend_min: null,
  reward: 500,
  pay_after_days: 30,
  custom_prints: false,
  monthly_cap: null,
  credit_max_percent: 30,
  credit_expiry_months: null,
};

/** A full body, the defaults with the programme on. */
const valid = { ...DEFAULTS, enabled: true };

const put = async (body: unknown, as?: string) =>
  http()
    .put("/api/v1/admin/settings/referrals")
    .set("Cookie", as ?? (await signIn(db, cfg, "admin")).cookie)
    .send(body as object);

describe("PUT /admin/settings/referrals", () => {
  it("starts off, giving €5 and getting €5", async () => {
    const res = await http().get("/api/v1/settings");
    expect(res.body.data.referrals).toEqual(DEFAULTS);
  });

  it("saves the rule, and the storefront sees it", async () => {
    const rule = {
      enabled: true,
      friend_kind: "percent",
      friend_value: 10,
      friend_min: 3000,
      reward: 700,
      pay_after_days: 14,
      custom_prints: true,
      monthly_cap: 5,
      credit_max_percent: 50,
      credit_expiry_months: 12,
    };
    const res = await put(rule);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Referral programme updated",
      data: { referrals: rule },
    });
    // the rest of the settings come along, as the other saves send them
    expect(res.body.data).toMatchObject({ theme: "editorial" });
    expect(res.body.data).not.toHaveProperty("referrals_enabled");
    expect(res.body.data).not.toHaveProperty("credit_max_percent");
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.referrals).toEqual(rule);
  });

  it("clears the limits with null or left out", async () => {
    await put({ ...valid, friend_min: 3000, monthly_cap: 5 });
    const {
      friend_min: _min,
      monthly_cap: _cap,
      credit_expiry_months: _expiry,
      ...rest
    } = valid;
    expect((await put(rest)).body.data.referrals).toEqual(valid);
  });

  it("takes the limits", async () => {
    const top = {
      ...valid,
      friend_value: 100_000,
      friend_min: 100_000,
      reward: 100_000,
      pay_after_days: 365,
      monthly_cap: 100,
      credit_max_percent: 100,
      credit_expiry_months: 60,
    };
    expect((await put(top)).body.data.referrals).toEqual(top);
    const low = {
      ...valid,
      friend_kind: "percent",
      friend_value: 50,
      pay_after_days: 0,
      credit_max_percent: 1,
    };
    expect((await put(low)).status).toBe(200);
  });

  const cases: [string, unknown, string, string][] = [
    [
      "a discount of 0",
      { ...valid, friend_value: 0 },
      "friend_value",
      "OUT_OF_RANGE",
    ],
    [
      "a discount over €1,000",
      { ...valid, friend_value: 100_001 },
      "friend_value",
      "OUT_OF_RANGE",
    ],
    // euros, not cents
    ["part of a cent", { ...valid, reward: 4.9 }, "reward", "INVALID_TYPE"],
    ["no credit", { ...valid, reward: undefined }, "reward", "REQUIRED_FIELD"],
    [
      "an unknown kind",
      { ...valid, friend_kind: "fixed" },
      "friend_kind",
      "INVALID_VALUE",
    ],
    [
      "a minimum of €0",
      { ...valid, friend_min: 0 },
      "friend_min",
      "OUT_OF_RANGE",
    ],
    [
      "a negative wait",
      { ...valid, pay_after_days: -1 },
      "pay_after_days",
      "OUT_OF_RANGE",
    ],
    ["a cap of 0", { ...valid, monthly_cap: 0 }, "monthly_cap", "OUT_OF_RANGE"],
    [
      "credit over 100% of an order",
      { ...valid, credit_max_percent: 101 },
      "credit_max_percent",
      "OUT_OF_RANGE",
    ],
    [
      "an expiry over 60 months",
      { ...valid, credit_expiry_months: 61 },
      "credit_expiry_months",
      "OUT_OF_RANGE",
    ],
  ];
  it.each(cases)("refuses %s", async (_name, body, field, code) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors[0]).toMatchObject({ field, code });
    // nothing changed
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.referrals).toEqual(DEFAULTS);
  });

  it("refuses a percent over 50", async () => {
    const res = await put({
      ...valid,
      friend_kind: "percent",
      friend_value: 51,
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({
      field: "friend_value",
      message: "Keep the friend's discount to 50% or less",
    });
  });

  it("says what's wrong in words the admin can act on", async () => {
    expect(
      (await put({ ...valid, reward: 100_001 })).body.errors[0].message,
    ).toBe("Keep the referrer's credit to €1,000 or less");
    expect(
      (await put({ ...valid, friend_min: 0 })).body.errors[0].message,
    ).toBe("The minimum order needs to be above €0");
  });

  it("is for admins only", async () => {
    const customer = cookieFor(cfg, await makeUser(db));
    expect((await put(valid, customer)).status).toBe(403);
    expect(
      (await http().put("/api/v1/admin/settings/referrals").send(valid)).status,
    ).toBe(401);
    const settings = await http().get("/api/v1/settings");
    expect(settings.body.data.referrals).toEqual(DEFAULTS);
  });
});
