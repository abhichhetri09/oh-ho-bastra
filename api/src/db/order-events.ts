import { orderEvent, orderEventType } from "./schema.ts";
import type { Tx } from "./stock.ts";

export type OrderEventType = (typeof orderEventType.enumValues)[number];

export async function logOrderEvent(
  tx: Tx,
  orderId: string,
  type: OrderEventType,
  { message, actorId }: { message?: string; actorId?: string } = {},
) {
  await tx.insert(orderEvent).values({ orderId, type, message, actorId });
}
