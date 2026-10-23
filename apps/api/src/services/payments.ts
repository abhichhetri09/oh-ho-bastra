import Stripe from "stripe";
import type { Config } from "../config";
import { log } from "../log";

// The payment provider seen by checkout: Stripe in production, a fake in
// tests (the port of internal/pkg/payments).

/** A webhook's signature didn't verify. */
export class InvalidSignatureError extends Error {
  constructor() {
    super("payments: invalid webhook signature");
    this.name = "InvalidSignatureError";
  }
}

/**
 * The provider declining a request (a disputed charge, a short balance):
 * retrying won't help, unlike an error reaching it. `reason` is the
 * provider's own message.
 */
export class RefusedError extends Error {
  constructor(readonly reason: string) {
    super("payments: refused: " + reason);
    this.name = "RefusedError";
  }
}

/** One priced line of a hosted checkout page. */
export interface LineItem {
  name: string;
  /** "" without an image. */
  image: string;
  /** cents */
  unitAmount: number;
  quantity: number;
}

/**
 * The hosted checkout page for one order. The amounts come from our own
 * prices, never from the client.
 */
export interface SessionRequest {
  orderId: string;
  orderNumber: number;
  email: string;
  currency: string;
  items: LineItem[];
  /** cents; 0 shows as free shipping */
  shipping: number;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

/** What checkout needs to know about a hosted checkout page. */
export interface Session {
  id: string;
  url: string;
  /** From the session's metadata ("" when missing). */
  orderId: string;
  paid: boolean;
  expired: boolean;
  /** "" when there is none. */
  paymentIntentId: string;
  amountTotal: number;
  currency: string;
}

/** The part of a webhook event checkout reacts to. */
export type EventKind =
  | "other"
  /** The shopper finished checkout; session.paid says whether the money is in (delayed methods pay later). */
  | "completed"
  /** A delayed payment succeeded. */
  | "paid"
  /** The page expired unpaid. */
  | "expired"
  /** A delayed payment failed. */
  | "failed";

/** A verified webhook event. */
export interface PaymentEvent {
  id: string;
  type: string;
  kind: EventKind;
  /** Only set for the checkout.session.* kinds. */
  session: Session;
}

/** An empty session, as Go's zero value. */
export const emptySession = (): Session => ({
  id: "",
  url: "",
  orderId: "",
  paid: false,
  expired: false,
  paymentIntentId: "",
  amountTotal: 0,
  currency: "",
});

/** Creates and reads hosted checkout pages and verifies webhooks. */
export interface PaymentProvider {
  createSession(req: SessionRequest): Promise<Session>;
  getSession(id: string): Promise<Session>;
  expireSession(id: string): Promise<void>;
  /**
   * Returns a payment in full and gives the refund's id. The idempotency
   * key makes a retry return the same refund, not a second one; a payment
   * refunded already (a retry after the key expired) gives the existing
   * refund. A refusal is a RefusedError.
   */
  refund(paymentIntentId: string, idempotencyKey: string): Promise<string>;
  /** Throws InvalidSignatureError when the signature doesn't verify. */
  parseEvent(payload: Buffer, signature: string): PaymentEvent;
}

const EVENT_KINDS: Record<string, EventKind> = {
  "checkout.session.completed": "completed",
  "checkout.session.async_payment_succeeded": "paid",
  "checkout.session.expired": "expired",
  "checkout.session.async_payment_failed": "failed",
};

/** The provider for Stripe Checkout. */
export class StripePayments implements PaymentProvider {
  private readonly client: Stripe;

  /**
   * Needs a secret key and at least one webhook signing secret, which are
   * tried in turn: the dashboard endpoint's secret and, in development,
   * the one `stripe listen` signs with. options are for tests (a local
   * host to talk to).
   */
  constructor(
    secretKey: string,
    private readonly webhookSecrets: string[],
    options?: Stripe.StripeConfig,
  ) {
    if (!secretKey) throw new Error("payments: STRIPE_SECRET_KEY is empty");
    if (webhookSecrets.length === 0)
      throw new Error("payments: no Stripe webhook secret");
    this.client = new Stripe(secretKey, options);
  }

  async createSession(req: SessionRequest): Promise<Session> {
    const lineItems = req.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: req.currency,
        unit_amount: item.unitAmount,
        product_data: {
          name: item.name,
          ...(item.image ? { images: [item.image] } : {}),
        },
      },
    }));
    const number = String(req.orderNumber);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      // Charge exactly the order total in its currency: with Adaptive
      // Pricing on, Stripe may present (and report) a converted amount.
      adaptive_pricing: { enabled: false },
      line_items: lineItems,
      customer_email: req.email,
      client_reference_id: req.orderId,
      metadata: { order_id: req.orderId, order_number: number },
      payment_intent_data: {
        description: "Oh Ho Bastra order " + number,
        metadata: { order_id: req.orderId },
      },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name:
              req.shipping === 0 ? "Free shipping" : "Standard shipping",
            type: "fixed_amount",
            fixed_amount: { amount: req.shipping, currency: req.currency },
          },
        },
      ],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(req.expiresAt.getTime() / 1000),
    };
    try {
      // A retried request for the same order gets the same session.
      const session = await this.client.checkout.sessions.create(params, {
        idempotencyKey: "checkout-" + req.orderId,
      });
      return fromStripe(session);
    } catch (err) {
      throw wrap("stripe: create checkout session", err);
    }
  }

  async getSession(id: string): Promise<Session> {
    try {
      return fromStripe(await this.client.checkout.sessions.retrieve(id));
    } catch (err) {
      throw wrap("stripe: retrieve checkout session", err);
    }
  }

  async expireSession(id: string): Promise<void> {
    try {
      await this.client.checkout.sessions.expire(id);
    } catch (err) {
      throw wrap("stripe: expire checkout session", err);
    }
  }

  async refund(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<string> {
    try {
      const refund = await this.client.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey },
      );
      return refund.id;
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        if (err.code === "charge_already_refunded") {
          const existing = await this.existingRefund(paymentIntentId);
          if (existing !== null) return existing;
        }
        const status = err.statusCode ?? 0;
        if (status >= 400 && status < 500) throw new RefusedError(err.message);
      }
      throw wrap("stripe: refund", err);
    }
  }

  /** The payment's refund that went through (or is going), or null. */
  private async existingRefund(
    paymentIntentId: string,
  ): Promise<string | null> {
    try {
      for await (const refund of this.client.refunds.list({
        payment_intent: paymentIntentId,
      })) {
        if (refund.status === "succeeded" || refund.status === "pending")
          return refund.id;
      }
    } catch {
      return null;
    }
    return null;
  }

  parseEvent(payload: Buffer, signature: string): PaymentEvent {
    let event: Stripe.Event | undefined;
    for (const secret of this.webhookSecrets) {
      try {
        // Events carry the account's API version, which needn't match the
        // library's; only the fields read below matter.
        event = this.client.webhooks.constructEvent(payload, signature, secret);
        break;
      } catch {
        // try the next secret
      }
    }
    if (!event) throw new InvalidSignatureError();

    const kind = EVENT_KINDS[event.type] ?? "other";
    const out: PaymentEvent = {
      id: event.id,
      type: event.type,
      kind,
      session: emptySession(),
    };
    if (kind === "other") return out;
    out.session = fromStripe(event.data.object as Stripe.Checkout.Session);
    return out;
  }
}

function fromStripe(s: Stripe.Checkout.Session): Session {
  const pi = s.payment_intent;
  return {
    id: s.id ?? "",
    url: s.url ?? "",
    orderId: s.metadata?.order_id ?? "",
    paid: s.payment_status === "paid",
    expired: s.status === "expired",
    paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? ""),
    amountTotal: s.amount_total ?? 0,
    currency: s.currency ?? "",
  };
}

function wrap(msg: string, err: unknown): Error {
  return new Error(
    `${msg}: ${err instanceof Error ? err.message : String(err)}`,
    { cause: err },
  );
}

/**
 * Stripe, or null (checkout answers 503) where payments aren't configured,
 * such as CI. index.ts has already checked the key and FRONTEND_URL.
 */
export function createPayments(cfg: Config): PaymentProvider | null {
  try {
    return new StripePayments(cfg.stripeSecretKey, cfg.stripeWebhookSecrets);
  } catch (err) {
    log.warn("payments disabled", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
