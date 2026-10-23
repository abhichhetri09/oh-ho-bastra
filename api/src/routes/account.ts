import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.ts";
import { order, orderStatus, savedAddress } from "../db/schema.ts";
import { paged, pageQuery } from "../pagination.ts";
import { currentUser } from "../session.ts";

// Mounted behind requireUser: everything here is scoped to the signed-in user.
export const account = Router();

const itemCount = sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_item oi where oi.order_id = "order"."id")`;
const firstItem = sql<string | null>`(select oi.product_name from order_item oi where oi.order_id = "order"."id" order by oi.id limit 1)`;

const orderColumns = {
  id: order.id,
  number: order.number,
  status: order.status,
  totalCents: order.totalCents,
  currency: order.currency,
  createdAt: order.createdAt,
  shippedAt: order.shippedAt,
  trackingNumber: order.trackingNumber,
  itemCount,
  firstItem,
};

account.get("/summary", async (_req, res) => {
  const user = currentUser(res);
  const [[stats], recent, [address]] = await Promise.all([
    db
      .select({
        orders: sql<number>`count(*)::int`,
        // Only paid and shipped orders count as spend.
        spentCents: sql<number>`coalesce(sum(${order.totalCents}) filter (where ${order.status} in ('paid', 'fulfilled')), 0)::int`,
        inTransit: sql<number>`count(*) filter (where ${order.status} = 'paid')::int`,
      })
      .from(order)
      .where(eq(order.userId, user.id)),
    db.select(orderColumns).from(order).where(eq(order.userId, user.id)).orderBy(desc(order.createdAt)).limit(3),
    db.select().from(savedAddress).where(eq(savedAddress.userId, user.id)),
  ]);
  res.json({ ...stats, memberSince: user.createdAt, recent, address: address ?? null });
});

const ordersQuery = pageQuery.extend({
  status: z.enum(orderStatus.enumValues).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

account.get("/orders", async (req, res) => {
  const user = currentUser(res);
  const { status, page, pageSize } = ordersQuery.parse(req.query);
  const mine = eq(order.userId, user.id);
  const where = and(mine, status ? eq(order.status, status) : undefined);
  const [rows, [{ total }], counts] = await Promise.all([
    db.select(orderColumns).from(order).where(where).orderBy(desc(order.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(order).where(where),
    db.select({ status: order.status, count: sql<number>`count(*)::int` }).from(order).where(mine).groupBy(order.status),
  ]);
  res.json({
    ...paged(rows, total, page, pageSize),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
  });
});

account.get("/address", async (_req, res) => {
  const [address] = await db.select().from(savedAddress).where(eq(savedAddress.userId, currentUser(res).id));
  res.json(address ?? null);
});

const addressBody = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(20),
  street: z.string().trim().min(1).max(200),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Finnish postal codes are 5 digits"),
  city: z.string().trim().min(1).max(100),
});

account.put("/address", async (req, res) => {
  const body = addressBody.parse(req.body);
  const userId = currentUser(res).id;
  const [saved] = await db
    .insert(savedAddress)
    .values({ userId, ...body })
    .onConflictDoUpdate({ target: savedAddress.userId, set: body })
    .returning();
  res.json(saved);
});

account.delete("/address", async (_req, res) => {
  await db.delete(savedAddress).where(eq(savedAddress.userId, currentUser(res).id));
  res.status(204).end();
});
