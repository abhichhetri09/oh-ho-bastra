import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testConfig } from "./helpers";
import {
  createPayments,
  InvalidSignatureError,
  RefusedError,
  StripePayments,
  type SessionRequest,
} from "../src/services/payments";

// StripePayments against a local stand-in for api.stripe.com: what it
// sends, and how it reads Stripe's answers and webhooks.

interface Seen {
  method: string;
  path: string;
  idempotencyKey: string | undefined;
  form: Record<string, string>;
}

let server: Server;
let seen: Seen[] = [];
/** Answers by "METHOD path" (path without the query). */
let answers: Record<string, { status: number; body: unknown }> = {};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = (req.url ?? "").split("?")[0]!;
    seen.push({
      method: req.method ?? "",
      path,
      idempotencyKey: req.headers["idempotency-key"] as string | undefined,
      form: Object.fromEntries(new URLSearchParams(body)),
    });
    const answer = answers[`${req.method} ${path}`] ?? {
      status: 404,
      body: { error: { message: "No such route" } },
    };
    res.writeHead(answer.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(answer.body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen = [];
  answers = {};
});

const SECRET = "whsec_test_secret";
const stripe = () =>
  new StripePayments("sk_test_123", ["whsec_other", SECRET], {
    host: "127.0.0.1",
    port: (server.address() as AddressInfo).port,
    protocol: "http",
    maxNetworkRetries: 0,
  });

const session = (fields: Record<string, unknown> = {}) => ({
  id: "cs_test_1",
  object: "checkout.session",
  url: "https://checkout.stripe.com/c/pay/cs_test_1",
  metadata: {
    order_id: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
    order_number: "1042",
  },
  payment_status: "unpaid",
  status: "open",
  amount_total: 5490,
  currency: "eur",
  payment_intent: null,
  ...fields,
});

describe("StripePayments", () => {
  it("needs a key and a webhook secret", () => {
    expect(() => new StripePayments("", ["whsec"])).toThrow(
      "payments: STRIPE_SECRET_KEY is empty",
    );
    expect(() => new StripePayments("sk_test", [])).toThrow(
      "payments: no Stripe webhook secret",
    );
    expect(
      createPayments({
        ...testConfig(),
        stripeSecretKey: "sk_test",
        stripeWebhookSecrets: [],
      }),
    ).toBeNull();
    expect(
      createPayments({
        ...testConfig(),
        stripeSecretKey: "sk_test",
        stripeWebhookSecrets: ["whsec"],
      }),
    ).toBeInstanceOf(StripePayments);
  });

  it("creates the hosted page for an order, keyed by the order", async () => {
    answers["POST /v1/checkout/sessions"] = { status: 200, body: session() };
    const req: SessionRequest = {
      orderId: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      orderNumber: 1042,
      email: "ada@example.com",
      currency: "eur",
      items: [
        {
          name: "Tee (Black / M)",
          image: "https://img/tee.jpg",
          unitAmount: 2500,
          quantity: 2,
        },
        { name: "Mug", image: "", unitAmount: 1200, quantity: 1 },
      ],
      shipping: 0,
      successUrl:
        "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "http://localhost:3000/cart?checkout=cancelled",
      expiresAt: new Date("2026-10-10T12:31:00Z"),
    };
    const out = await stripe().createSession(req);
    expect(out).toEqual({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      orderId: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      paid: false,
      expired: false,
      paymentIntentId: "",
      amountTotal: 5490,
      currency: "eur",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.idempotencyKey).toBe(
      "checkout-0f6ada99-b884-4c07-88d4-7843a41cdda8",
    );
    expect(seen[0]!.form).toEqual({
      mode: "payment",
      "adaptive_pricing[enabled]": "false",
      "line_items[0][quantity]": "2",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": "2500",
      "line_items[0][price_data][product_data][name]": "Tee (Black / M)",
      "line_items[0][price_data][product_data][images][0]":
        "https://img/tee.jpg",
      "line_items[1][quantity]": "1",
      "line_items[1][price_data][currency]": "eur",
      "line_items[1][price_data][unit_amount]": "1200",
      "line_items[1][price_data][product_data][name]": "Mug",
      customer_email: "ada@example.com",
      client_reference_id: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      "metadata[order_id]": "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      "metadata[order_number]": "1042",
      "payment_intent_data[description]": "Oh Ho Bastra order 1042",
      "payment_intent_data[metadata][order_id]":
        "0f6ada99-b884-4c07-88d4-7843a41cdda8",
      "shipping_options[0][shipping_rate_data][display_name]": "Free shipping",
      "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
      "shipping_options[0][shipping_rate_data][fixed_amount][amount]": "0",
      "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "eur",
      success_url:
        "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/cart?checkout=cancelled",
      expires_at: String(Date.parse("2026-10-10T12:31:00Z") / 1000),
    });

    await stripe().createSession({ ...req, shipping: 490 });
    expect(
      seen[1]!.form["shipping_options[0][shipping_rate_data][display_name]"],
    ).toBe("Standard shipping");
  });

  it("reads, and expires, a session", async () => {
    answers["GET /v1/checkout/sessions/cs_test_1"] = {
      status: 200,
      body: session({
        payment_status: "paid",
        status: "complete",
        payment_intent: "pi_1",
      }),
    };
    answers["POST /v1/checkout/sessions/cs_test_1/expire"] = {
      status: 200,
      body: session({ status: "expired" }),
    };
    expect(await stripe().getSession("cs_test_1")).toMatchObject({
      paid: true,
      expired: false,
      paymentIntentId: "pi_1",
    });
    await stripe().expireSession("cs_test_1");
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /v1/checkout/sessions/cs_test_1",
      "POST /v1/checkout/sessions/cs_test_1/expire",
    ]);
  });

  it("wraps errors reaching Stripe", async () => {
    answers["POST /v1/checkout/sessions/cs_x/expire"] = {
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          message: "Only open sessions can be expired.",
        },
      },
    };
    await expect(stripe().expireSession("cs_x")).rejects.toThrow(
      "stripe: expire checkout session: Only open sessions can be expired.",
    );
  });

  it("refunds keyed by the caller", async () => {
    answers["POST /v1/refunds"] = {
      status: 200,
      body: { id: "re_1", object: "refund", status: "succeeded" },
    };
    expect(await stripe().refund("pi_1", "refund-abc")).toBe("re_1");
    expect(seen[0]).toMatchObject({
      idempotencyKey: "refund-abc",
      form: { payment_intent: "pi_1" },
    });
  });

  it("gives the existing refund of a payment refunded already", async () => {
    answers["POST /v1/refunds"] = {
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          code: "charge_already_refunded",
          message: "Already refunded",
        },
      },
    };
    answers["GET /v1/refunds"] = {
      status: 200,
      body: {
        object: "list",
        url: "/v1/refunds",
        has_more: false,
        data: [
          { id: "re_failed", object: "refund", status: "failed" },
          { id: "re_ok", object: "refund", status: "pending" },
        ],
      },
    };
    expect(await stripe().refund("pi_1", "refund-abc")).toBe("re_ok");
  });

  it("turns a 4xx into a RefusedError, and anything else into an error", async () => {
    answers["POST /v1/refunds"] = {
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          code: "charge_disputed",
          message: "Charge ch_1 has been disputed.",
        },
      },
    };
    const err = await stripe()
      .refund("pi_1", "k")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefusedError);
    expect((err as RefusedError).reason).toBe("Charge ch_1 has been disputed.");

    answers["POST /v1/refunds"] = {
      status: 500,
      body: { error: { type: "api_error", message: "Boom" } },
    };
    const err2 = await stripe()
      .refund("pi_1", "k")
      .catch((e: unknown) => e);
    expect(err2).not.toBeInstanceOf(RefusedError);
    expect((err2 as Error).message).toBe("stripe: refund: Boom");
  });
});

describe("StripePayments.parseEvent", () => {
  const signed = (event: unknown, secret = SECRET) => {
    const payload = JSON.stringify(event);
    return {
      payload: Buffer.from(payload),
      header: Stripe.webhooks.generateTestHeaderString({ payload, secret }),
    };
  };
  const event = (type: string, object: unknown) => ({
    id: "evt_1",
    object: "event",
    api_version: "2020-08-27",
    type,
    data: { object },
  });

  it.each([
    ["checkout.session.completed", "completed"],
    ["checkout.session.async_payment_succeeded", "paid"],
    ["checkout.session.expired", "expired"],
    ["checkout.session.async_payment_failed", "failed"],
  ])("reads %s as %s, with any secret and API version", (type, kind) => {
    const { payload, header } = signed(
      event(
        type,
        session({
          payment_status: "paid",
          status: "complete",
          payment_intent: { id: "pi_9", object: "payment_intent" },
        }),
      ),
    );
    expect(stripe().parseEvent(payload, header)).toEqual({
      id: "evt_1",
      type,
      kind,
      session: {
        id: "cs_test_1",
        url: "https://checkout.stripe.com/c/pay/cs_test_1",
        orderId: "0f6ada99-b884-4c07-88d4-7843a41cdda8",
        paid: true,
        expired: false,
        paymentIntentId: "pi_9",
        amountTotal: 5490,
        currency: "eur",
      },
    });
  });

  it("reads other events as other", () => {
    const { payload, header } = signed(
      event("payment_intent.created", { id: "pi_1" }),
    );
    expect(stripe().parseEvent(payload, header)).toMatchObject({
      id: "evt_1",
      type: "payment_intent.created",
      kind: "other",
    });
  });

  it("refuses a bad or missing signature", () => {
    const { payload } = signed(event("checkout.session.completed", session()));
    const wrong = signed(
      event("checkout.session.completed", session()),
      "whsec_wrong",
    ).header;
    expect(() => stripe().parseEvent(payload, wrong)).toThrow(
      InvalidSignatureError,
    );
    expect(() => stripe().parseEvent(payload, "")).toThrow(
      InvalidSignatureError,
    );
    expect(() =>
      stripe().parseEvent(Buffer.from("not json"), "t=1,v1=x"),
    ).toThrow(InvalidSignatureError);
  });
});
