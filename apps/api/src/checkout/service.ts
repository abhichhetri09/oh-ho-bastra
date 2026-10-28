import {
  clearDefaultAddress,
  countAddresses,
  createAddress,
  createOrder,
  createOrderItem,
  ensureCart,
  getAddress,
  getCartCoupon,
  getCartLines,
  getUserByID,
  listExpiredPendingOrders,
  listPendingOrdersForUser,
  lockAddresses,
  lockVariants,
  recordStripeEvent,
  setOrderSession,
  takeStock,
  type GetCartLinesRow,
  type Order,
} from "../db/gen";
import {
  checkoutCoupon,
  normalizeEmail,
  recordRedemption,
} from "../coupons/coupons";
import type { Queryable } from "../db/queryable";
import { withTx, type Pool } from "../db/pool";
import { log } from "../log";
import type {
  PaymentEvent,
  PaymentProvider,
  SessionRequest,
} from "../services/payments";
import {
  addressFromRow,
  createAddressParams,
  normalizeAddress,
  optionSuffix,
  snapshot,
  type AddressInput,
} from "./address";
import * as fulfilment from "./fulfilment";
import { RESERVATION_TTL_MS } from "./fulfilment";
import {
  errAddressNotFound,
  errCartEmpty,
  errCartHasIssues,
  errGuestEmail,
  errProvider,
} from "./refusal";
import { CURRENCY, shippingFor } from "./shipping";
import { fulfil, release, sessionOrderId } from "./settle";

// Turns a cart into an order and a hosted Stripe Checkout page, and settles
// orders from Stripe's answers (the port of internal/checkout).
//
// Stock is reserved when checkout starts (so a paid order can't oversell)
// and returned when the order is cancelled: the page expired, its payment
// failed, the shopper started a new checkout, or the reservation ran out
// without word from Stripe.

export { Refusal } from "./refusal";
export {
  canApply,
  transitionRefusal,
  RESERVATION_TTL_MS,
  type Action,
} from "./fulfilment";

/** Lets Stripe's own expiry event arrive before the sweeper releases an order itself. */
export const RELEASE_GRACE_MS = 5 * 60_000;
/** Caps an address book. */
export const MAX_ADDRESSES = 10;

/**
 * A checkout request, as validated by the handler (exactly one of
 * address_id and address; a guest gives an email and an address).
 */
export interface CheckoutRequest {
  /** Where a guest's order emails go; an account's own email is used instead. */
  email?: string;
  address_id?: string;
  address?: Partial<AddressInput>;
  /** Adds the new address to the address book. */
  save_address?: boolean;
  /** With save_address, makes the new address the default. */
  make_default?: boolean;
}

export interface CheckoutResult {
  order_number: number;
  checkout_url: string;
}

/**
 * Checkout and fulfilment. It needs a provider; without one (no Stripe
 * key) the handlers answer 503 before calling it.
 */
export class CheckoutService implements fulfilment.FulfilmentContext {
  /** The clock (replaceable in tests). */
  now: () => Date = () => new Date();

  constructor(
    readonly db: Pool,
    readonly provider: PaymentProvider | null,
    readonly frontendUrl: string,
  ) {}

  /** Whether payments are configured. */
  enabled(): boolean {
    return this.provider !== null;
  }

  private get stripe(): PaymentProvider {
    if (!this.provider)
      throw new Error("checkout: payments are not configured");
    return this.provider;
  }

  /**
   * Reserves the cart's stock in a new pending order and opens a Stripe
   * Checkout page for it. The order's email (where its emails go, and who
   * a once-per-customer code counts) is the account's, or the one a guest
   * gave; a guest ships to a new address and saves nothing.
   */
  async start(userId: string, req: CheckoutRequest): Promise<CheckoutResult> {
    const provider = this.stripe;
    const user = await getUserByID(this.db, userId);
    if (!user) throw new Error("get user: no rows in result set");
    const guest = user.role === "guest";
    const email = guest ? normalizeEmail(req.email ?? "") : user.email;
    if (!email) throw errGuestEmail;

    // Free reservations that ran out, so their stock counts here.
    try {
      await this.releaseExpired();
    } catch (err) {
      log.warn("checkout: release expired orders", { err: String(err) });
    }

    const staleSlots: string[] = []; // Stripe sessions of the user's replaced checkouts
    const { order, lines } = await withTx(this.db, async (tx) => {
      // Lock the cart first, as cart writes do, so it can't change under us.
      await ensureCart(tx, userId);
      const lines = await getCartLines(tx, userId);
      if (lines.length === 0) throw errCartEmpty;

      // A new checkout replaces the user's unpaid ones and their holds.
      for (const p of await listPendingOrdersForUser(tx, userId)) {
        await release(tx, p.id);
        if (p.stripe_session_id !== null) staleSlots.push(p.stripe_session_id);
      }

      const subtotal = lines.reduce(
        (sum, line) => sum + line.price * line.quantity,
        0,
      );
      // The bag's code, checked again now that the replaced checkouts gave
      // their uses back, and locked until this order holds its own use.
      const code = (await getCartCoupon(tx, userId))?.coupon_code ?? null;
      const applied =
        code === null
          ? null
          : await checkoutCoupon(tx, code, {
              subtotal,
              email,
              now: this.now(),
            });
      const discount = applied?.discount ?? 0;

      await reserve(tx, lines);
      // A guest has no address book: only the new address counts.
      const address = await this.address(
        tx,
        userId,
        guest ? { address: req.address } : req,
      );

      // Free shipping counts what is paid for the items, after the code.
      const shipping = shippingFor(subtotal - discount);
      const order = await createOrder(tx, {
        user_id: userId,
        subtotal,
        discount,
        coupon_code: applied?.coupon.code ?? null,
        shipping,
        total: subtotal - discount + shipping,
        currency: CURRENCY,
        email,
        shipping_address: address,
        expires_at: new Date(this.now().getTime() + RESERVATION_TTL_MS),
      });
      if (!order) throw new Error("create order: no rows in result set");
      if (applied) await recordRedemption(tx, applied.coupon, order);
      for (const line of lines) {
        await createOrderItem(tx, {
          order_id: order.id,
          variant_id: line.variant_id,
          product_id: line.product_id,
          product_name: line.product_name,
          product_slug: line.product_slug,
          sku: line.sku,
          options: JSON.stringify(line.options),
          image: line.image,
          unit_price: line.price,
          quantity: line.quantity,
          line_total: line.price * line.quantity,
        });
      }
      return { order, lines };
    });

    // The replaced pages can't be paid any more (best effort: their orders
    // are already cancelled, and a late payment is handled in fulfil).
    for (const id of staleSlots) {
      try {
        await provider.expireSession(id);
      } catch (err) {
        log.warn("checkout: expire replaced session", {
          session: id,
          err: String(err),
        });
      }
    }

    let session;
    try {
      session = await provider.createSession(
        this.sessionRequest(order, email, lines),
      );
    } catch (err) {
      log.error("checkout: create session", err, { order: order.number });
      try {
        await this.release(order.id);
      } catch (relErr) {
        log.error("checkout: release after provider failure", relErr, {
          order: order.number,
        });
      }
      throw errProvider;
    }
    try {
      await setOrderSession(this.db, {
        id: order.id,
        stripe_session_id: session.id,
      });
    } catch (err) {
      // The webhook finds the order by its metadata; this only costs the
      // success page's lookup, which then 404s until a retry.
      log.error("checkout: save session id", err, { order: order.number });
    }
    return { order_number: order.number, checkout_url: session.url };
  }

  /**
   * Resolves the shipping address to snapshot on the order, saving a new
   * one to the address book when asked (and there's room), as the default
   * if asked. Two checkouts of one user can't race here: both hold the cart
   * lock. The book is locked in id order, as SetDefaultAddress does.
   */
  private async address(
    tx: Queryable,
    userId: string,
    req: CheckoutRequest,
  ): Promise<string> {
    if (req.address_id) {
      const saved = await getAddress(tx, {
        id: req.address_id.toLowerCase(),
        user_id: userId,
      });
      if (!saved) throw errAddressNotFound;
      return snapshot(addressFromRow(saved));
    }

    const input = normalizeAddress(req.address ?? {});
    if (req.save_address) {
      const count = (await countAddresses(tx, userId))?.count ?? 0;
      if (count < MAX_ADDRESSES) {
        if (req.make_default) {
          await lockAddresses(tx, userId);
          await clearDefaultAddress(tx, userId);
        }
        await createAddress(
          tx,
          createAddressParams(userId, input, !!req.make_default),
        );
      }
    }
    return snapshot(input);
  }

  /** The hosted checkout page for an order. */
  sessionRequest(
    order: Order,
    email: string,
    lines: GetCartLinesRow[],
  ): SessionRequest {
    return {
      orderId: order.id,
      orderNumber: order.number,
      email,
      currency: order.currency,
      items: lines.map((line) => ({
        name: line.product_name + optionSuffix(line.options),
        image: line.image,
        unitAmount: line.price,
        quantity: line.quantity,
      })),
      discount:
        order.discount > 0
          ? { amount: order.discount, name: order.coupon_code ?? "Discount" }
          : null,
      shipping: order.shipping,
      successUrl:
        this.frontendUrl + "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: this.frontendUrl + "/cart?checkout=cancelled",
      expiresAt: order.expires_at,
    };
  }

  /** Cancels a pending order and returns its stock. */
  async release(orderId: string): Promise<void> {
    await withTx(this.db, (tx) => release(tx, orderId));
  }

  /**
   * Cancels pending orders whose reservation ran out (plus a grace period
   * for Stripe's own expiry event) and returns their stock; resolves to how
   * many.
   */
  releaseExpired(): Promise<number> {
    return withTx(this.db, async (tx) => {
      let released = 0;
      const before = new Date(this.now().getTime() - RELEASE_GRACE_MS);
      for (const o of await listExpiredPendingOrders(tx, before)) {
        if (await release(tx, o.id)) released++;
      }
      return released;
    });
  }

  /**
   * Applies a verified webhook event once: the event id is recorded in the
   * same transaction, so a retry after a failure is applied again and a
   * duplicate is skipped.
   */
  async handleEvent(event: PaymentEvent): Promise<void> {
    if (event.kind === "other") return;
    await withTx(this.db, async (tx) => {
      if (
        (await recordStripeEvent(tx, { id: event.id, type: event.type })) === 0
      )
        return;
      switch (event.kind) {
        case "completed":
          // Delayed payment methods complete unpaid and pay later ("paid").
          if (!event.session.paid) return;
          return fulfil(tx, event.session);
        case "paid":
          return fulfil(tx, event.session);
        case "expired":
        case "failed": {
          const orderId = sessionOrderId(event.session);
          if (orderId === null) {
            log.warn("checkout: event without an order", {
              event: event.id,
              type: event.type,
            });
            return;
          }
          await release(tx, orderId);
        }
      }
    });
  }

  /**
   * Asks Stripe about a pending order's session and settles it, for when no
   * webhook has arrived (or none is set up, as in development).
   */
  async reconcile(sessionId: string): Promise<void> {
    const session = await this.stripe.getSession(sessionId);
    if (session.paid) {
      await withTx(this.db, (tx) => fulfil(tx, session));
    } else if (session.expired) {
      const orderId = sessionOrderId(session);
      if (orderId !== null) await this.release(orderId);
    }
  }

  // Fulfilment, for the admin order endpoints. Each throws a Refusal to
  // send as is; see fulfilment.ts.

  /** Marks a paid order shipped, with its tracking number ("" for none). */
  ship(number: number, tracking: string): Promise<Order> {
    return fulfilment.ship(this, number, tracking);
  }

  /** Marks a shipped order delivered. */
  deliver(number: number): Promise<Order> {
    return fulfilment.deliver(this, number);
  }

  /** Cancels an unpaid order (expiring its Stripe page first) and returns its stock. */
  cancelPending(number: number): Promise<Order> {
    return fulfilment.cancelPending(this, number);
  }

  /** Refunds a paid order in full through Stripe, returning its stock when restock is set. */
  refundPaid(number: number, restock: boolean): Promise<Order> {
    return fulfilment.refundPaid(this, number, restock);
  }
}

/** Checks every line against the locked variants and takes the stock. */
async function reserve(tx: Queryable, lines: GetCartLinesRow[]): Promise<void> {
  const ids = lines.map((l) => l.variant_id);
  const stock = new Map((await lockVariants(tx, ids)).map((v) => [v.id, v]));
  for (const line of lines) {
    const v = stock.get(line.variant_id);
    if (!v || !v.available || v.stock < line.quantity) throw errCartHasIssues;
  }
  await takeStock(tx, { ids, quantities: lines.map((l) => l.quantity) });
}
