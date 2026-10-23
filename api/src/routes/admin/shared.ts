import { sql } from "drizzle-orm";
import { order } from "../../db/schema.ts";

// Raw, fully qualified SQL: Drizzle drops table prefixes in single-table
// selects, which would make "id" resolve to order_item.id inside the subquery.
export const itemCount = sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_item oi where oi.order_id = "order"."id")`;

export const orderListColumns = {
  id: order.id,
  number: order.number,
  status: order.status,
  userId: order.userId,
  firstName: order.firstName,
  lastName: order.lastName,
  email: order.email,
  city: order.city,
  shippingMethod: order.shippingMethod,
  totalCents: order.totalCents,
  currency: order.currency,
  createdAt: order.createdAt,
  paidAt: order.paidAt,
  itemCount,
};
