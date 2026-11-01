import type { AdminOrderDetail } from "@repo/types";

// The refund dialog's preview: the same math as the API's
// (apps/api/src/checkout/refunds.ts), so the total shown is the total
// refunded. The API works it out again and is the one that counts.

/** Refunds whose money counts as gone back (Stripe may still be processing). */
const counted = (status: string) =>
  status === "pending" ||
  status === "requires_action" ||
  status === "succeeded";

/** The order's discount shared out over its lines, by line id. */
export function allocateDiscount(
  lines: { id: string; line_total: number }[],
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
export const unitsAmount = (net: number, q: number, r: number, k: number) =>
  Math.floor((net * (r + k)) / q) - Math.floor((net * r) / q);

/** How a refund splits between card and store credit. */
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

/** What has been refunded of an order so far. */
export function refundedSoFar(order: AdminOrderDetail) {
  const units = new Map<string, number>();
  let card = 0;
  let credit = 0;
  let shipping = false;
  for (const r of order.refunds) {
    if (!counted(r.status)) continue;
    card += r.amount_card;
    credit += r.amount_credit;
    if (r.shipping) shipping = true;
    for (const l of r.lines)
      units.set(
        l.order_item_id,
        (units.get(l.order_item_id) ?? 0) + l.quantity,
      );
  }
  const paid = order.total + order.credit;
  return {
    units,
    card,
    credit,
    shipping,
    left: Math.max(paid - card - credit, 0),
  };
}

/** A refund as the dialog has it. */
export interface RefundDraft {
  /** Units per line id. */
  quantities: Record<string, number>;
  shipping: boolean;
  /** cents */
  extra: number;
}

/** What a draft refund comes to: per line, in all, and by card and credit. */
export function previewRefund(order: AdminOrderDetail, draft: RefundDraft) {
  const so = refundedSoFar(order);
  const alloc = allocateDiscount(order.items, order.discount);
  const lines = order.items.map((item) => {
    const k = draft.quantities[item.id] ?? 0;
    const r = so.units.get(item.id) ?? 0;
    const net = item.line_total - (alloc.get(item.id) ?? 0);
    return {
      id: item.id,
      quantity: k,
      left: item.quantity - r,
      amount: k > 0 ? unitsAmount(net, item.quantity, r, k) : 0,
    };
  });
  const items = lines.reduce((s, l) => s + l.amount, 0);
  const shipping = draft.shipping && !so.shipping ? order.shipping : 0;
  let total = items + shipping + draft.extra;
  // More than is left: an extra is refused; lines alone are cut to it.
  const tooMuch = draft.extra > 0 && total > so.left;
  if (total > so.left) total = so.left;
  const { card, credit } = splitRefund({
    paidCard: order.total,
    paidCredit: order.credit,
    refundedCard: so.card,
    refundedCredit: so.credit,
    amount: total,
  });
  return {
    lines,
    items,
    shipping,
    total,
    card,
    credit,
    left: so.left,
    tooMuch,
    shippingRefunded: so.shipping,
    empty: total === 0 && lines.every((l) => l.quantity === 0),
  };
}
