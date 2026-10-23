import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.ts";
import { user } from "../../db/auth-schema.ts";
import { logOrderEvent } from "../../db/order-events.ts";
import { order, orderEvent, orderItem, orderStatus, payment } from "../../db/schema.ts";
import { lockOrder, releaseStock } from "../../db/stock.ts";
import { HttpError } from "../../http-error.ts";
import { currentAdmin } from "../../session.ts";
import { paged, pageQuery } from "../../pagination.ts";
import { orderListColumns } from "./shared.ts";

export const adminOrders = Router();

type OrderStatus = (typeof orderStatus.enumValues)[number];

// Status changes an admin may make. Cancelling a paid order assumes the refund
// is issued in the payment provider's dashboard.
const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ["cancelled"],
  paid: ["fulfilled", "cancelled"],
};

const listQuery = pageQuery.extend({
  status: z.enum(orderStatus.enumValues).optional(),
  q: z.string().trim().max(100).optional(),
});

adminOrders.get("/orders", async (req, res) => {
  const { status, q, page, pageSize } = listQuery.parse(req.query);
  const search = q
    ? or(
        ilike(order.email, `%${q}%`),
        ilike(sql`${order.firstName} || ' ' || ${order.lastName}`, `%${q}%`),
        /^\d+$/.test(q) ? eq(order.number, Number(q)) : undefined,
      )
    : undefined;
  const where = and(status ? eq(order.status, status) : undefined, search);

  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select(orderListColumns)
      .from(order)
      .where(where)
      .orderBy(desc(order.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(order).where(where),
    // Counts per status for the filter tabs (respecting the search, not the status).
    db
      .select({ status: order.status, count: sql<number>`count(*)::int` })
      .from(order)
      .where(search)
      .groupBy(order.status),
  ]);
  res.json({
    ...paged(rows, total, page, pageSize),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
  });
});

adminOrders.get("/orders/:id", async (req, res) => {
  const [row] = await db.select().from(order).where(eq(order.id, req.params.id));
  if (!row) {
    throw new HttpError(404, "Order not found");
  }
  const [items, payments, events, [customer]] = await Promise.all([
    db.select().from(orderItem).where(eq(orderItem.orderId, row.id)).orderBy(orderItem.id),
    db.select().from(payment).where(eq(payment.orderId, row.id)).orderBy(desc(payment.createdAt)),
    db
      .select({
        id: orderEvent.id,
        type: orderEvent.type,
        message: orderEvent.message,
        createdAt: orderEvent.createdAt,
        actorName: user.name,
      })
      .from(orderEvent)
      .leftJoin(user, eq(orderEvent.actorId, user.id))
      .where(eq(orderEvent.orderId, row.id))
      .orderBy(asc(orderEvent.createdAt), asc(orderEvent.id)),
    row.userId
      ? db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, row.userId))
      : Promise.resolve([]),
  ]);
  res.json({
    ...row,
    items,
    payments,
    events,
    customer: customer ?? null,
    allowedTransitions: transitions[row.status] ?? [],
  });
});

const statusBody = z.object({
  status: z.enum(orderStatus.enumValues),
  trackingNumber: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(500).optional(),
});

adminOrders.patch("/orders/:id", async (req, res) => {
  const { status: next, trackingNumber, reason } = statusBody.parse(req.body);
  const admin = currentAdmin(res);

  const result = await db.transaction(async (tx) => {
    const current = await lockOrder(tx, req.params.id);
    if (!current) {
      throw new HttpError(404, "Order not found");
    }
    if (!transitions[current.status]?.includes(next)) {
      throw new HttpError(409, `Cannot change an order from ${current.status} to ${next}`);
    }

    if (next === "fulfilled") {
      await tx
        .update(order)
        .set({ status: next, shippedAt: sql`now()`, trackingNumber: trackingNumber || null })
        .where(eq(order.id, current.id));
      await logOrderEvent(tx, current.id, "fulfilled", {
        message: trackingNumber ? `Shipped · tracking ${trackingNumber}` : "Marked as shipped",
        actorId: admin.id,
      });
    } else {
      await tx.update(order).set({ status: next }).where(eq(order.id, current.id));
      await tx
        .update(payment)
        .set({ status: "cancelled", completedAt: sql`now()` })
        .where(and(eq(payment.orderId, current.id), eq(payment.status, "pending")));
      await releaseStock(tx, current.id);
      await logOrderEvent(tx, current.id, "cancelled", {
        message: reason ? `Cancelled: ${reason}` : "Cancelled; stock released",
        actorId: admin.id,
      });
    }
    return { id: current.id, status: next };
  });
  res.json(result);
});

const noteBody = z.object({ message: z.string().trim().min(1).max(2000) });

adminOrders.post("/orders/:id/notes", async (req, res) => {
  const { message } = noteBody.parse(req.body);
  const [exists] = await db.select({ id: order.id }).from(order).where(eq(order.id, req.params.id));
  if (!exists) {
    throw new HttpError(404, "Order not found");
  }
  await db.insert(orderEvent).values({
    orderId: exists.id,
    type: "note",
    message,
    actorId: currentAdmin(res).id,
  });
  res.status(201).json({ ok: true });
});

const trackingBody = z.object({ trackingNumber: z.string().trim().max(60) });

// Add or correct the tracking number after an order has shipped.
adminOrders.put("/orders/:id/tracking", async (req, res) => {
  const { trackingNumber } = trackingBody.parse(req.body);
  const admin = currentAdmin(res);
  await db.transaction(async (tx) => {
    const current = await lockOrder(tx, req.params.id);
    if (!current) throw new HttpError(404, "Order not found");
    if (current.status !== "fulfilled") {
      throw new HttpError(409, "Mark the order as shipped first");
    }
    await tx.update(order).set({ trackingNumber: trackingNumber || null }).where(eq(order.id, current.id));
    await logOrderEvent(tx, current.id, "tracking_updated", {
      message: trackingNumber ? `Tracking number set to ${trackingNumber}` : "Tracking number removed",
      actorId: admin.id,
    });
  });
  res.json({ id: req.params.id, trackingNumber: trackingNumber || null });
});
