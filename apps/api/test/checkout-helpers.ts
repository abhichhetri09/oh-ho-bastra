import { randomUUID } from "node:crypto";
import { CheckoutService } from "../src/checkout/service";
import {
  createProduct,
  createProductVariant,
  createVariantOptionValue,
  ensureCart,
  setCartItemQuantity,
  upsertProductOption,
  upsertProductOptionValue,
} from "../src/db/gen";
import type { Pool } from "../src/db/pool";
import {
  emptySession,
  InvalidSignatureError,
  type PaymentEvent,
  type PaymentProvider,
  type Session,
  type SessionRequest,
} from "../src/services/payments";
import { setupTestApp } from "./helpers";

/** The signature FakePayments accepts. */
export const GOOD_SIGNATURE = "t=1,v1=good";

/**
 * A payment provider in memory: sessions it created can be read, paid and
 * expired, and each call can be made to fail.
 */
export class FakePayments implements PaymentProvider {
  sessions = new Map<string, Session>();
  created: SessionRequest[] = [];
  expired: string[] = [];
  refunds: { paymentIntentId: string; key: string }[] = [];
  failCreate = false;
  failGet = false;
  /** Thrown by expireSession (Stripe refuses to expire a complete page). */
  expireError: Error | null = null;
  /** Thrown by refund. */
  refundError: Error | null = null;
  private seq = 0;

  /** Forgets every session and failure (between tests). */
  reset() {
    this.sessions.clear();
    this.created = [];
    this.expired = [];
    this.refunds = [];
    this.failCreate = false;
    this.failGet = false;
    this.expireError = null;
    this.refundError = null;
    this.seq = 0;
  }

  async createSession(req: SessionRequest): Promise<Session> {
    this.created.push(req);
    if (this.failCreate)
      throw new Error("stripe: create checkout session: connection refused");
    const id = `cs_test_${++this.seq}`;
    const session: Session = {
      ...emptySession(),
      id,
      url: `https://checkout.stripe.test/${id}`,
      orderId: req.orderId,
      // As Stripe charges it: the items, less the one-off coupon, plus shipping.
      amountTotal:
        req.items.reduce((s, i) => s + i.unitAmount * i.quantity, 0) -
        (req.discount?.amount ?? 0) +
        req.shipping,
      currency: req.currency,
    };
    this.sessions.set(id, session);
    return { ...session };
  }

  async getSession(id: string): Promise<Session> {
    const s = this.sessions.get(id);
    if (this.failGet || !s)
      throw new Error("stripe: retrieve checkout session: no such session");
    return { ...s };
  }

  async expireSession(id: string): Promise<void> {
    if (this.expireError) throw this.expireError;
    this.expired.push(id);
    const s = this.sessions.get(id);
    if (s) s.expired = true;
  }

  async refund(paymentIntentId: string, key: string): Promise<string> {
    if (this.refundError) throw this.refundError;
    this.refunds.push({ paymentIntentId, key });
    return `re_${key}`;
  }

  /** The payload is a PaymentEvent as JSON. */
  parseEvent(payload: Buffer, signature: string): PaymentEvent {
    if (signature !== GOOD_SIGNATURE) throw new InvalidSignatureError();
    return JSON.parse(payload.toString()) as PaymentEvent;
  }

  /** Marks a session paid, as the shopper paying would. */
  pay(id: string, paymentIntentId = "pi_" + id): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`no session ${id}`);
    s.paid = true;
    s.paymentIntentId = paymentIntentId;
    return { ...s };
  }
}

/** setupTestApp with a FakePayments behind checkout. */
export function setupCheckoutApp() {
  const ctx = setupTestApp();
  const payments = new FakePayments();
  const service = new CheckoutService(ctx.db, payments, ctx.cfg.frontendUrl);
  ctx.deps.payments = payments;
  ctx.deps.checkout = service;
  return { ...ctx, payments, service };
}

/** A sellable product with one variant (options as [name, value] pairs). */
export async function makeVariant(
  db: Pool,
  fields: {
    name?: string;
    price?: number;
    stock?: number;
    options?: [string, string][];
    image?: string;
  } = {},
) {
  const name = fields.name ?? "Tee";
  const product = await createProduct(db, {
    name,
    slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`,
    category_id: null,
    description: null,
    features: [],
    images: fields.image ? [fields.image] : [],
    image_public_ids: fields.image ? ["img"] : [],
    is_active: true,
    is_featured: false,
  });
  const variant = await createProductVariant(db, {
    product_id: product!.id,
    sku: `SKU-${randomUUID().slice(0, 8)}`,
    stock: fields.stock ?? 10,
    images: [],
    image_public_ids: [],
    selling_price: fields.price ?? 2500,
    offer_price: null,
    offer_expires_at: null,
    is_default: true,
    is_active: true,
    option_combination_key: randomUUID(),
  });
  for (const [optName, value] of fields.options ?? []) {
    const option = await upsertProductOption(db, {
      product_id: product!.id,
      name: optName,
      type: "text",
    });
    const ov = await upsertProductOptionValue(db, {
      option_id: option!.id,
      value,
    });
    await createVariantOptionValue(db, {
      variant_id: variant!.id,
      option_value_id: ov!.id,
    });
  }
  return { product: product!, variant: variant! };
}

/** Puts quantity of the variant in the user's cart. */
export async function addToCart(
  db: Pool,
  userId: string,
  variantId: string,
  quantity = 1,
) {
  const cart = await ensureCart(db, userId);
  await setCartItemQuantity(db, {
    cart_id: cart!.id,
    variant_id: variantId,
    quantity,
  });
}

export async function stockOf(db: Pool, variantId: string): Promise<number> {
  const { rows } = await db.query<{ stock: number }>(
    "SELECT stock FROM product_variants WHERE id = $1",
    [variantId],
  );
  return rows[0]!.stock;
}

export const ADDRESS = {
  full_name: "Ada Lovelace",
  phone: "5550100",
  line1: "1 Main St",
  city: "London",
  postal_code: "sw1a 1aa",
  country: "GB",
};

/** A webhook event body for FakePayments. */
export const eventBody = (
  event: Partial<Omit<PaymentEvent, "session">> & {
    session?: Partial<Session>;
  },
) =>
  JSON.stringify({
    id: event.id ?? `evt_${randomUUID()}`,
    type: event.type ?? "checkout.session.completed",
    kind: event.kind ?? "completed",
    session: { ...emptySession(), ...event.session },
  });

/**
 * A checkout of quantity units of a new variant by userId, paid unless
 * paid is false (settled the way the success page does).
 */
export async function placeOrder(
  ctx: { db: Pool; service: CheckoutService; payments: FakePayments },
  userId: string,
  opts: {
    quantity?: number;
    stock?: number;
    price?: number;
    paid?: boolean;
  } = {},
) {
  const { variant, product } = await makeVariant(ctx.db, {
    stock: opts.stock ?? 10,
    price: opts.price ?? 2500,
  });
  await addToCart(ctx.db, userId, variant.id, opts.quantity ?? 1);
  const { order_number } = await ctx.service.start(userId, {
    address: ADDRESS,
  });
  const { rows } = await ctx.db.query(
    "SELECT id, stripe_session_id FROM orders WHERE number = $1",
    [order_number],
  );
  const sessionId = rows[0].stripe_session_id as string;
  if (opts.paid !== false) {
    ctx.payments.pay(sessionId);
    await ctx.service.reconcile(sessionId);
  }
  return {
    number: order_number,
    id: rows[0].id as string,
    sessionId,
    variant,
    product,
  };
}
