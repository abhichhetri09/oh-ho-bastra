import { randomUUID } from "node:crypto";
import {
  addRefundItem,
  addVariantStock,
  adminGetOrderForUpdate,
  adoptRefund,
  cancelOrderReferral,
  createRefund,
  enqueueRefundEmail,
  getOrderForUpdate,
  getOrderItems,
  getOrderPayment,
  getPaymentByIntent,
  getPendingOrderReferral,
  getRefundByRequest,
  getRefundByStripeID,
  listOrderRefundItems,
  listOrderRefunds,
  recordRefund,
  setOrderDispute,
  setOrderRefunds,
  setRefundStatus,
  type Order,
  type OrderItem,
  type OrderRefund,
} from "../db/gen";
import { withTx } from "../db/pool";
import type { Queryable } from "../db/queryable";
import { log } from "../log";
import { reverseRefundCredit, takeBackRefundCredit } from "../referrals/credit";
import {
  RefusedError,
  type DisputeInfo,
  type RefundInfo,
} from "../services/payments";
import {
  canApply,
  errNoPayment,
  errOrderNotFound,
  errStripe,
  REFUND_TIMEOUT_MS,
  transitionRefusal,
  type FulfilmentContext,
} from "./fulfilment";
import { Refusal } from "./refusal";

// Refunds: an order is given back in one or more parts until nothing is
// left. Each part is lines (with quantities), the shipping, and/or a
// goodwill amount; its money goes back the way the order was paid, part
// by card (a Stripe refund) and part as store credit (a ledger row).
//
// Amounts (all integer cents, never more than is left to refund):
//
// - A line is worth what was paid for it: its line_total less its share of
//   the order's discount. The discount is shared out over the lines in
//   proportion to line_total (as Stripe spreads an amount-off coupon over
//   line items), rounded down, with the cents left over going one each to
//   the lines with the largest remainders (ties: the order's line order),
//   so the shares add up to the discount exactly.
// - k units of a line of q units worth N, after r were refunded, are worth
//   floor(N·(r+k)/q) − floor(N·r/q): any sequence of partial refunds of a
//   line adds up to exactly N, and the rounding cent goes with later units.
// - Shipping is refunded whole, once.
// - A goodwill extra is added on top; the total can't pass what is left
//   (refused when an extra would). Without an extra a total past what is
//   left (after refunds made in the Stripe Dashboard) is cut to it.
//
// Card/credit split: by the share each paid, cumulatively. After this
// refund, credit given back so far is floor(credit_paid · refunded / paid)
// (the card gets the rounding cent), so a refund of everything left gives
// back exactly what is left of each and the totals reconcile. Refunds made
// in the Dashboard are card only; the split then moves toward credit to
// stay within what each paid.

/** Refund statuses whose money counts as gone back (Stripe may still be processing it). */
const COUNTED = new Set(["pending", "requires_action", "succeeded"]);

export const isCounted = (status: string) => COUNTED.has(status);

/** One line of an admin's refund request. */
export interface RefundLineRequest {
  item_id: string;
  quantity: number;
  /** Return these units to stock; the refund's restock otherwise. */
  restock?: boolean;
}

/**
 * What an admin asks to refund. With none of items, shipping and extra
 * set, everything left is refunded (the order's full refund).
 */
export interface RefundRequest {
  /** The client's id for this request: a retry with it refunds once. */
  request_id?: string;
  /** Return the refunded units to stock. */
  restock: boolean;
  items?: RefundLineRequest[];
  /** Refund the shipping (once per order). */
  shipping?: boolean;
  /** A goodwill amount on top, cents. */
  extra?: number;
  /** Why: kept with the refund. */
  note?: string;
}

const refuse = (message: string) => new Refusal(409, "INVALID_REFUND", message);

/**
 * The order's discount shared out over its lines (see the top of the
 * file), by line id.
 */
export function allocateDiscount(
  lines: Pick<OrderItem, "id" | "line_total">[],
  discount: number,
): Map<string, number> {
  const out = new Map(lines.map((l) => [l.id, 0]));
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const d = Math.min(Math.max(discount, 0), subtotal);
  if (d === 0) return out;
  let given = 0;
  const rest = lines.map((l, i) => {
    const exact = d * l.line_total;
    const share = Math.floor(exact / subtotal);
    out.set(l.id, share);
    given += share;
    return { id: l.id, r: exact % subtotal, i };
  });
  rest.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let j = 0; given < d; j++, given++)
    out.set(rest[j]!.id, out.get(rest[j]!.id)! + 1);
  return out;
}

/** What k units of a q-unit line worth net come to, after r were refunded. */
export function unitsAmount(net: number, q: number, r: number, k: number) {
  return Math.floor((net * (r + k)) / q) - Math.floor((net * r) / q);
}

/** How a refund of amount splits between card and credit (see the top of the file). */
export function splitRefund(p: {
  paidCard: number;
  paidCredit: number;
  refundedCard: number;
  refundedCredit: number;
  amount: number;
}): { card: number; credit: number } {
  const paid = p.paidCard + p.paidCredit;
  const cardLeft = Math.max(p.paidCard - p.refundedCard, 0);
  const creditLeft = Math.max(p.paidCredit - p.refundedCredit, 0);
  const after = p.refundedCard + p.refundedCredit + p.amount;
  let credit =
    paid === 0 || after >= paid
      ? creditLeft
      : Math.floor((p.paidCredit * after) / paid) - p.refundedCredit;
  credit = Math.min(Math.max(credit, 0), Math.min(p.amount, creditLeft));
  let card = p.amount - credit;
  if (card > cardLeft) {
    credit += card - cardLeft;
    card = cardLeft;
  }
  return { card, credit };
}

/** An order's refunds so far. */
export interface RefundState {
  items: OrderItem[];
  refunds: OrderRefund[];
  /** Units refunded per line (counted refunds). */
  refundedQty: Map<string, number>;
  /** Units returned to stock per line (any refund). */
  restocked: Map<string, number>;
  shippingRefunded: boolean;
  refundedCard: number;
  refundedCredit: number;
}

export async function loadRefundState(
  db: Queryable,
  orderId: string,
): Promise<RefundState> {
  // One after another: db may be a transaction's client.
  const items = await getOrderItems(db, orderId);
  const refunds = await listOrderRefunds(db, orderId);
  const lines = await listOrderRefundItems(db, orderId);
  const counted = new Set(
    refunds.filter((r) => isCounted(r.status)).map((r) => r.id),
  );
  const refundedQty = new Map<string, number>();
  const restocked = new Map<string, number>();
  for (const l of lines) {
    restocked.set(
      l.order_item_id,
      (restocked.get(l.order_item_id) ?? 0) + l.restocked,
    );
    if (counted.has(l.refund_id))
      refundedQty.set(
        l.order_item_id,
        (refundedQty.get(l.order_item_id) ?? 0) + l.quantity,
      );
  }
  let refundedCard = 0;
  let refundedCredit = 0;
  let shippingRefunded = false;
  for (const r of refunds) {
    if (!counted.has(r.id)) continue;
    refundedCard += r.amount_card;
    refundedCredit += r.amount_credit;
    if (r.shipping) shippingRefunded = true;
  }
  return {
    items,
    refunds,
    refundedQty,
    restocked,
    shippingRefunded,
    refundedCard,
    refundedCredit,
  };
}

/** A refund worked out, before anything is done. */
export interface RefundPlan {
  lines: {
    item: OrderItem;
    quantity: number;
    amount: number;
    /** Units to return to stock. */
    restock: number;
  }[];
  shipping: boolean;
  amountItems: number;
  amountShipping: number;
  amountExtra: number;
  total: number;
  card: number;
  credit: number;
}

/** Works out a refund of order (see the top of the file); throws a 409 Refusal for a request that doesn't fit. */
export function planRefund(
  order: Pick<Order, "total" | "credit" | "discount" | "shipping">,
  state: RefundState,
  req: RefundRequest,
): RefundPlan {
  const paid = order.total + order.credit;
  const left = Math.max(paid - state.refundedCard - state.refundedCredit, 0);
  const alloc = allocateDiscount(state.items, order.discount);
  const full =
    req.items === undefined &&
    req.shipping === undefined &&
    (req.extra ?? 0) === 0;
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const unitsLeft = (i: OrderItem) =>
    i.quantity - (state.refundedQty.get(i.id) ?? 0);

  const wanted: RefundLineRequest[] = full
    ? state.items
        .filter((i) => unitsLeft(i) > 0)
        .map((i) => ({ item_id: i.id, quantity: unitsLeft(i) }))
    : (req.items ?? []);
  const seen = new Set<string>();
  const lines: RefundPlan["lines"] = [];
  for (const w of wanted) {
    const item = byId.get(w.item_id.toLowerCase());
    if (!item) throw refuse("A line to refund isn't part of this order");
    if (seen.has(item.id)) throw refuse("Each line can be listed once");
    seen.add(item.id);
    if (!Number.isInteger(w.quantity) || w.quantity < 1)
      throw refuse("Refund at least one unit of a line");
    const refunded = state.refundedQty.get(item.id) ?? 0;
    if (w.quantity > item.quantity - refunded)
      throw refuse(
        `Only ${item.quantity - refunded} of ${item.product_name} can still be refunded`,
      );
    const net = item.line_total - (alloc.get(item.id) ?? 0);
    const takeable =
      item.quantity -
      item.stock_shortfall -
      (state.restocked.get(item.id) ?? 0);
    const restock =
      (w.restock ?? req.restock) && item.variant_id !== null
        ? Math.max(Math.min(w.quantity, takeable), 0)
        : 0;
    lines.push({
      item,
      quantity: w.quantity,
      amount: unitsAmount(net, item.quantity, refunded, w.quantity),
      restock,
    });
  }

  const shipping = full
    ? !state.shippingRefunded && order.shipping > 0
    : !!req.shipping;
  if (shipping && state.shippingRefunded)
    throw refuse("The shipping was refunded already");
  const amountItems = lines.reduce((s, l) => s + l.amount, 0);
  const amountShipping = shipping ? order.shipping : 0;
  const extra = req.extra ?? 0;
  if (!Number.isInteger(extra) || extra < 0)
    throw refuse("The extra amount must be whole cents, 0 or more");

  let total = amountItems + amountShipping + extra;
  if (full) total = left;
  else if (total > left) {
    if (extra > 0)
      throw new Refusal(
        409,
        "REFUND_TOO_LARGE",
        `That is more than is left to refund (${left} cents)`,
      );
    total = left;
  }
  if (total === 0 && lines.length === 0)
    throw refuse(
      full ? "Nothing is left to refund" : "Choose something to refund",
    );

  const { card, credit } = splitRefund({
    paidCard: order.total,
    paidCredit: order.credit,
    refundedCard: state.refundedCard,
    refundedCredit: state.refundedCredit,
    amount: total,
  });
  return {
    lines,
    shipping,
    amountItems,
    amountShipping,
    amountExtra: Math.max(total - amountItems - amountShipping, 0),
    total,
    card,
    credit,
  };
}

/** The status an order's fulfilment gives it, without refunds. */
const fulfilmentStatus = (order: Pick<Order, "shipped_at" | "delivered_at">) =>
  order.delivered_at !== null
    ? "delivered"
    : order.shipped_at !== null
      ? "shipped"
      : "paid";

/**
 * Writes the order's refund totals from its refunds and the status they
 * give it (refunded once everything is back, partially_refunded before),
 * and cancels its referral before payout when it is refunded in full or
 * what the friend kept fell below the referral's minimum.
 */
export async function applyRefundTotals(
  tx: Queryable,
  order: Order,
  touch: boolean,
): Promise<Order> {
  const state = await loadRefundState(tx, order.id);
  const paid = order.total + order.credit;
  const refunded = state.refundedCard + state.refundedCredit;
  const any = state.refunds.some((r) => isCounted(r.status));
  const allUnits = state.items.every(
    (i) => (state.refundedQty.get(i.id) ?? 0) >= i.quantity,
  );
  const full = any && refunded >= paid && (paid > 0 || allUnits);
  const status = full
    ? "refunded"
    : any
      ? "partially_refunded"
      : fulfilmentStatus(order);
  const updated = await setOrderRefunds(tx, {
    refunded_total: refunded,
    refunded_credit: state.refundedCredit,
    status,
    touch,
    id: order.id,
  });
  if (!updated) throw new Error("set order refunds: no rows in result set");

  // The friend's discount needed friend_min of goods (the subtotal at
  // sale prices); a referral pays out only for an order that still meets it.
  if (full) {
    await cancelOrderReferral(tx, order.id);
  } else {
    const referral = await getPendingOrderReferral(tx, order.id);
    if (referral && referral.friend_min !== null) {
      const kept = state.items.reduce(
        (s, i) =>
          s + i.unit_price * (i.quantity - (state.refundedQty.get(i.id) ?? 0)),
        0,
      );
      if (kept < referral.friend_min) {
        await cancelOrderReferral(tx, order.id);
        log.info("refunds: referral cancelled below its minimum", {
          order: order.number,
          kept,
          min: referral.friend_min,
        });
      }
    }
  }
  return updated;
}

/**
 * Refunds part (or the rest) of a paid order. The order stays locked
 * across the Stripe call. The Stripe refund is keyed by the request id
 * (or, without one, by the order and how many refunds it had), so a
 * retry after a failure here, or a double click, can't refund twice; a
 * request id already used answers with the order as it is.
 *
 * If Stripe made the refund but this transaction then failed (a timeout,
 * the database), nothing is recorded here: a retry with the same request
 * id gets the same Stripe refund back and records it, and otherwise
 * Stripe's refund.created webhook records it as a card refund made
 * outside the admin (which a later retry then takes over).
 */
export function refundOrder(
  ctx: FulfilmentContext,
  number: number,
  req: RefundRequest,
  adminId: string | null,
): Promise<Order> {
  return withTx(ctx.db, async (tx) => {
    const order = await adminGetOrderForUpdate(tx, number);
    if (!order) throw errOrderNotFound;
    const requestId = req.request_id?.toLowerCase() ?? null;
    if (requestId !== null) {
      const prior = await getRefundByRequest(tx, requestId);
      if (prior) {
        if (prior.order_id !== order.id)
          throw new Refusal(
            409,
            "REFUND_REQUEST_REUSED",
            "This refund request belongs to another order",
          );
        return order; // a retry: refunded once already
      }
    }
    if (!canApply("refund", order.status))
      throw transitionRefusal("refund", order.status);

    const state = await loadRefundState(tx, order.id);
    const plan = planRefund(order, state, req);
    const refundId = randomUUID();

    let stripe: RefundInfo | null = null;
    if (plan.card > 0) {
      const payment = await getOrderPayment(tx, order.id);
      if (!payment || payment.stripe_payment_intent_id === null)
        throw errNoPayment;
      if (!ctx.provider) throw new Error("refund: payments are not configured");
      const key =
        "refund-" +
        // Without a request id: the order and how many refunds it has had
        // (failed ones too), so a retry of this one reuses the key and a
        // later one, even after a failed refund, gets a new one.
        (requestId ?? `${order.id}-${state.refunds.length}`);
      try {
        stripe = await withTimeout(
          ctx.provider.refund({
            paymentIntentId: payment.stripe_payment_intent_id,
            amount: plan.card,
            idempotencyKey: key,
            metadata: {
              order_id: order.id,
              order_number: String(order.number),
              refund_id: refundId,
            },
          }),
          REFUND_TIMEOUT_MS,
        );
      } catch (err) {
        if (err instanceof RefusedError) {
          throw new Refusal(
            409,
            "REFUND_REFUSED",
            "Stripe refused the refund: " + err.reason,
          );
        }
        log.error("checkout: refund", err, { order: number });
        throw errStripe;
      }
      if (!isCounted(stripe.status)) {
        // Failed at once (or replayed after it failed): nothing went back.
        throw new Refusal(
          409,
          "REFUND_REFUSED",
          "Stripe couldn't make the refund" +
            (stripe.failureReason ? `: ${stripe.failureReason}` : ""),
        );
      }
      await recordRefund(tx, { id: payment.id, stripe_refund_id: stripe.id });
    }

    const fields = {
      amount_credit: plan.credit,
      amount_items: plan.amountItems,
      amount_shipping: plan.amountShipping,
      amount_extra: plan.amountExtra,
      shipping: plan.shipping,
      note: (req.note ?? "").trim(),
      created_by: adminId,
      request_id: requestId,
    };
    // Stripe's webhook may have recorded this card refund already (this
    // request timed out after Stripe made it, and is now retried).
    const known = stripe ? await getRefundByStripeID(tx, stripe.id) : null;
    let row: OrderRefund | null;
    if (known && known.source === "admin") {
      log.warn("refunds: Stripe refund recorded already", {
        order: number,
        refund: known.id,
      });
      return order;
    } else if (known) {
      row = await adoptRefund(tx, { id: known.id, ...fields });
      if (row && row.status !== stripe!.status)
        row = await setRefundStatus(tx, {
          id: row.id,
          status: stripe!.status,
          failure_reason: null,
        });
    } else {
      row = await createRefund(tx, {
        id: refundId,
        order_id: order.id,
        stripe_refund_id: stripe?.id ?? null,
        status: stripe?.status ?? "succeeded",
        amount_card: plan.card,
        source: "admin",
        ...fields,
      });
    }
    if (!row) throw new Error("create refund: no rows in result set");

    for (const line of plan.lines) {
      if (line.restock > 0 && line.item.variant_id !== null)
        await addVariantStock(tx, {
          quantity: line.restock,
          id: line.item.variant_id,
        });
      await addRefundItem(tx, {
        refund_id: row.id,
        order_item_id: line.item.id,
        quantity: line.quantity,
        amount: line.amount,
        restocked: line.restock,
      });
    }
    await reverseRefundCredit(tx, order, row.id, plan.credit, ctx.now());
    const updated = await applyRefundTotals(tx, order, true);
    await enqueueRefundEmail(tx, { order_id: order.id, refund_id: row.id });
    log.info("checkout: order refunded", {
      order: number,
      card: plan.card,
      credit: plan.credit,
      lines: plan.lines.length,
      status: updated.status,
    });
    return updated;
  });
}

/** The order of a payment intent, locked; null (logged) when it isn't ours. */
async function orderOfIntent(
  tx: Queryable,
  paymentIntentId: string,
  what: Record<string, unknown>,
): Promise<Order | null> {
  if (!paymentIntentId) return null;
  const payment = await getPaymentByIntent(tx, paymentIntentId);
  if (!payment) {
    log.warn("refunds: event for an unknown payment", what);
    return null;
  }
  return getOrderForUpdate(tx, payment.order_id);
}

/**
 * Brings a Stripe refund into the order's refunds (from a webhook): a
 * refund an admin made here is matched by its Stripe id and only its
 * status follows Stripe's; one made in the Dashboard is recorded as a card
 * refund. A refund that failed (or was cancelled) no longer counts: its
 * store credit is taken back and the lines can be refunded again (stock
 * that went back stays). Applying the same state twice changes nothing.
 */
export async function syncStripeRefund(
  tx: Queryable,
  info: RefundInfo,
): Promise<void> {
  const order = await orderOfIntent(tx, info.paymentIntentId, {
    refund: info.id,
  });
  if (!order) return;
  const row = await getRefundByStripeID(tx, info.id);
  if (row) {
    if (row.status === info.status) return;
    const was = isCounted(row.status);
    const now = isCounted(info.status);
    await setRefundStatus(tx, {
      id: row.id,
      status: info.status,
      failure_reason: info.failureReason || null,
    });
    if (was && !now) {
      await takeBackRefundCredit(tx, order, row.id, row.amount_credit);
      await applyRefundTotals(tx, order, false);
      log.warn("refunds: refund failed at Stripe", {
        order: order.number,
        refund: info.id,
        reason: info.failureReason,
      });
    } else if (!was && now) {
      await applyRefundTotals(tx, order, true);
      log.warn("refunds: failed refund went through after all", {
        order: order.number,
        refund: info.id,
      });
    }
    return;
  }
  if (!isCounted(info.status)) return; // never counted, nothing went back
  if (order.paid_at === null) {
    log.warn("refunds: refund of an unpaid order", { order: order.number });
    return;
  }
  const created = await createRefund(tx, {
    id: randomUUID(),
    order_id: order.id,
    request_id: null,
    stripe_refund_id: info.id,
    status: info.status,
    amount_card: info.amount,
    amount_credit: 0,
    amount_items: 0,
    amount_shipping: 0,
    amount_extra: info.amount,
    shipping: false,
    source: "stripe",
    note: "Refunded in Stripe",
    created_by: null,
  });
  if (!created) throw new Error("create refund: no rows in result set");
  const updated = await applyRefundTotals(tx, order, true);
  await enqueueRefundEmail(tx, { order_id: order.id, refund_id: created.id });
  log.info("refunds: recorded a refund made in Stripe", {
    order: order.number,
    amount: info.amount,
    status: updated.status,
  });
}

/**
 * Records a chargeback's status on its order. While one is open (or once
 * lost) the referral doesn't pay out; a lost one cancels it.
 */
export async function syncDispute(
  tx: Queryable,
  info: DisputeInfo,
): Promise<void> {
  const order = await orderOfIntent(tx, info.paymentIntentId, {
    dispute: info.id,
  });
  if (!order) return;
  await setOrderDispute(tx, { dispute_status: info.status, id: order.id });
  if (info.status === "lost") await cancelOrderReferral(tx, order.id);
  log.warn("refunds: payment disputed", {
    order: order.number,
    status: info.status,
    reason: info.reason,
    amount: info.amount,
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
