import { describe, expect, it } from "vitest";
import { ADDRESS } from "./checkout-helpers";
import { setupTestApp, signIn } from "./helpers";

// Without a Stripe key checkout is off; the rest of the API still runs.
const { http, db, cfg } = setupTestApp();

describe("checkout without payments", () => {
  it.each([
    ["post", "/api/v1/checkout", { address: ADDRESS }],
    ["post", "/api/v1/webhooks/stripe", {}],
    ["get", "/api/v1/checkout/sessions/cs_test_1", undefined],
  ] as const)("%s %s answers 503", async (method, path, body) => {
    const { cookie } = await signIn(db, cfg);
    const req =
      method === "post" ? http().post(path).send(body) : http().get(path);
    const res = await req.set("Cookie", cookie);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      message: "Payments are not set up on this server",
      code: "PAYMENTS_UNAVAILABLE",
    });
  });

  it("still serves orders and addresses", async () => {
    const { cookie } = await signIn(db, cfg);
    expect(
      (await http().get("/api/v1/orders").set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (await http().get("/api/v1/addresses").set("Cookie", cookie)).status,
    ).toBe(200);
  });
});
