import type { Request, Response } from "express";
import {
  getOrderItems,
  getOrderPayment,
  getUserByID,
  listOrderRefundItems,
  listOrderRefunds,
  type Order,
  type OrderRefund,
  type OrderRefundItem,
} from "../db/gen";
import type { Queryable } from "../db/queryable";
import { internal } from "../http/response";

/**
 * The app's JSON replacer drops stock_shortfall everywhere (the shopper
 * never sees it), but the admin's order lines carry it (Go's AdminOrderItem
 * re-exposed the field), so this response is serialised without that rule.
 */
function sendAdminJson(res: Response, status: number, body: unknown) {
  const json = JSON.stringify(body, (key, value: unknown) =>
    key === "password_hash" ? undefined : value,
  );
  res.status(status).type("application/json").send(json);
}

/**
 * The order as the admin sees it: what was bought (with each line's
 * shortfall), by whom (a customer, or a guest), and the payment (null
 * until it is paid).
 */
export async function respondOrder(
  req: Request,
  res: Response,
  db: Queryable,
  order: Order,
  message: string,
) {
  const items = await getOrderItems(db, order.id);
  const user = await getUserByID(db, order.user_id);
  if (user === null) {
    internal(
      req,
      res,
      "failed to get the order's customer",
      new Error("no rows in result set"),
    );
    return;
  }
  const payment = await getOrderPayment(db, order.id);
  const refunds = await refundsOf(db, order.id);
  // A guest has no email of its own: the order's is the one to write to.
  const guest = user.role === "guest";
  sendAdminJson(res, 200, {
    success: true,
    message,
    data: {
      ...order,
      items,
      customer: {
        id: user.id,
        name: user.name,
        email: guest ? order.email : (user.email ?? order.email),
        guest,
      },
      payment,
      refunds,
    },
  });
}

/** An order's refunds, oldest first, each with its lines and its admin. */
export async function refundsOf(db: Queryable, orderId: string) {
  const rows = await listOrderRefunds(db, orderId);
  const lines = await listOrderRefundItems(db, orderId);
  const names = new Map<string, string>();
  for (const id of new Set(rows.map((r) => r.created_by))) {
    if (id === null) continue;
    names.set(id, (await getUserByID(db, id))?.name ?? "");
  }
  return rows.map((r: OrderRefund) => ({
    id: r.id,
    stripe_refund_id: r.stripe_refund_id,
    status: r.status,
    amount_card: r.amount_card,
    amount_credit: r.amount_credit,
    amount_items: r.amount_items,
    amount_shipping: r.amount_shipping,
    amount_extra: r.amount_extra,
    shipping: r.shipping,
    source: r.source,
    note: r.note,
    created_by:
      r.created_by === null
        ? null
        : { id: r.created_by, name: names.get(r.created_by) ?? "" },
    failure_reason: r.failure_reason,
    created_at: r.created_at,
    lines: lines
      .filter((l: OrderRefundItem) => l.refund_id === r.id)
      .map((l) => ({
        order_item_id: l.order_item_id,
        quantity: l.quantity,
        amount: l.amount,
        restocked: l.restocked,
      })),
  }));
}
