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

/** A discount code's amount off an order, as the page shows it. */
export interface SessionDiscount {
  /** cents, at most the items' total */
  amount: number;
  /** The code, shown beside the amount. */
  name: string;
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
  /** Taken off the items (not shipping); null without a code. */
  discount: SessionDiscount | null;
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

/** A refund of a payment, as Stripe reports it. */
export interface RefundInfo {
  id: string;
  /** "" when the refund isn't of a payment intent. */
  paymentIntentId: string;
  /** cents */
  amount: number;
  currency: string;
  /** pending, requires_action, succeeded, failed or canceled. */
  status: string;
  /** Stripe's reason for a failed refund, or "". */
  failureReason: string;
}

/** A chargeback on a payment. */
export interface DisputeInfo {
  id: string;
  paymentIntentId: string;
  /** needs_response, under_review, won, lost, warning_* ... */
  status: string;
  amount: number;
  reason: string;
}

/** What a refund request asks of the provider. */
export interface RefundRequest {
  paymentIntentId: string;
  /** cents, at most what is left of the payment */
  amount: number;
  /** A retry with the same key gets the same refund, never a second one. */
  idempotencyKey: string;
  /** Stored on the refund (our order and refund ids), to match it up later. */
  metadata: Record<string, string>;
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
  | "failed"
  /** A refund was made or changed (refund.created/updated/failed): event.refund. */
  | "refund"
  /** A charge was refunded (charge.refunded, maybe in the Dashboard): event.paymentIntentId. */
  | "charge_refunded"
  /** A chargeback opened or changed (charge.dispute.*): event.dispute. */
  | "dispute";

/** A verified webhook event. */
export interface PaymentEvent {
  id: string;
  type: string;
  kind: EventKind;
  /** Only set for the checkout.session.* kinds. */
  session: Session;
  /** Only set for the refund kind. */
  refund?: RefundInfo;
  /** Only set for the dispute kind. */
  dispute?: DisputeInfo;
  /** The charge's payment intent, for charge_refunded. */
  paymentIntentId?: string;
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
   * Returns amount of a payment and gives the refund as Stripe has it
   * (pending until the money is on its way, for some methods). The
   * idempotency key makes a retry return the same refund, not a second
   * one. A refusal (more than is left, a disputed charge, a payment
   * refunded in full already) is a RefusedError.
   */
  refund(req: RefundRequest): Promise<RefundInfo>;
  /** Every refund of a payment (to sync refunds made in the Dashboard). */
  listRefunds(paymentIntentId: string): Promise<RefundInfo[]>;
  /** Throws InvalidSignatureError when the signature doesn't verify. */
  parseEvent(payload: Buffer, signature: string): PaymentEvent;
}

const EVENT_KINDS: Record<string, EventKind> = {
  "checkout.session.completed": "completed",
  "checkout.session.async_payment_succeeded": "paid",
  "checkout.session.expired": "expired",
  "checkout.session.async_payment_failed": "failed",
  "refund.created": "refund",
  "refund.updated": "refund",
  "refund.failed": "refund",
  "charge.refunded": "charge_refunded",
  "charge.dispute.created": "dispute",
  "charge.dispute.updated": "dispute",
  "charge.dispute.closed": "dispute",
};

/** The Stripe events the webhook endpoint must be subscribed to. */
export const WEBHOOK_EVENTS = Object.keys(EVENT_KINDS);

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
    const discounts = req.discount
      ? [
          {
            coupon: await this.orderCoupon(
              req.orderId,
              req.currency,
              req.discount,
            ),
          },
        ]
      : undefined;
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      // Charge exactly the order total in its currency: with Adaptive
      // Pricing on, Stripe may present (and report) a converted amount.
      adaptive_pricing: { enabled: false },
      line_items: lineItems,
      ...(discounts ? { discounts } : {}),
      customer_email: req.email,
      client_reference_id: req.orderId,
      metadata: { order_id: req.orderId, order_number: number },
      payment_intent_data: {
        description: "OH : HO !! Bastra order " + number,
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

  /**
   * A one-off Stripe coupon for an order's discount: line items can't be
   * negative, so the amount our code took off goes on the page as Stripe's
   * own discount, usable once. Keyed by the order, so a retry reuses it.
   */
  private async orderCoupon(
    orderId: string,
    currency: string,
    discount: SessionDiscount,
  ): Promise<string> {
    try {
      const coupon = await this.client.coupons.create(
        {
          amount_off: discount.amount,
          currency,
          duration: "once",
          max_redemptions: 1,
          name: discount.name,
          metadata: { order_id: orderId },
        },
        { idempotencyKey: "coupon-" + orderId },
      );
      return coupon.id;
    } catch (err) {
      throw wrap("stripe: create coupon", err);
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

  async refund(req: RefundRequest): Promise<RefundInfo> {
    try {
      const refund = await this.client.refunds.create(
        {
          payment_intent: req.paymentIntentId,
          amount: req.amount,
          metadata: req.metadata,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      return refundInfo(refund);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        // 4xx: declined (charge_already_refunded, amount_too_large, a
        // disputed charge, an idempotency key reused with other values).
        const status = err.statusCode ?? 0;
        if (status >= 400 && status < 500) throw new RefusedError(err.message);
      }
      throw wrap("stripe: refund", err);
    }
  }

  async listRefunds(paymentIntentId: string): Promise<RefundInfo[]> {
    const out: RefundInfo[] = [];
    try {
      for await (const refund of this.client.refunds.list({
        payment_intent: paymentIntentId,
        limit: 100,
      })) {
        out.push(refundInfo(refund));
      }
    } catch (err) {
      throw wrap("stripe: list refunds", err);
    }
    return out;
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
    switch (kind) {
      case "other":
        return out;
      case "refund":
        out.refund = refundInfo(event.data.object as Stripe.Refund);
        return out;
      case "charge_refunded":
        out.paymentIntentId = idOf(
          (event.data.object as Stripe.Charge).payment_intent,
        );
        return out;
      case "dispute": {
        const d = event.data.object as Stripe.Dispute;
        out.dispute = {
          id: d.id,
          paymentIntentId: idOf(d.payment_intent),
          status: d.status,
          amount: d.amount,
          reason: d.reason ?? "",
        };
        return out;
      }
      default:
        out.session = fromStripe(event.data.object as Stripe.Checkout.Session);
        return out;
    }
  }
}

/** An expandable field's id ("" when unset). */
const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? "");

function refundInfo(r: Stripe.Refund): RefundInfo {
  return {
    id: r.id,
    paymentIntentId: idOf(r.payment_intent),
    amount: r.amount,
    currency: r.currency,
    status: r.status ?? "pending",
    failureReason: r.failure_reason ?? "",
  };
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
