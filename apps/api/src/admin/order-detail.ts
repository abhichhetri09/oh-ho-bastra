import type { Request, Response } from "express";
import {
  getOrderItems,
  getOrderPayment,
  getUserByID,
  type Order,
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
    },
  });
}
