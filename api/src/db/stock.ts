import { eq, sql } from "drizzle-orm";
import type { db } from "./index.ts";
import { order, orderItem, productVariant } from "./schema.ts";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Lock the order row. Every status change takes this lock first, so payment
// callbacks and admin actions on the same order run one after another.
export async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx
    .select({ id: order.id, status: order.status })
    .from(order)
    .where(eq(order.id, orderId))
    .for("update");
  return row;
}

// Return an order's reserved units to stock (on cancel or failed payment).
export async function releaseStock(tx: Tx, orderId: string) {
  await tx.execute(sql`
    update ${productVariant} set stock = ${productVariant.stock} + ${orderItem.quantity}
    from ${orderItem}
    where ${orderItem.variantId} = ${productVariant.id}
      and ${orderItem.orderId} = ${orderId}
  `);
}
