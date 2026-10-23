import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/index.ts";
import { user } from "../../db/auth-schema.ts";
import { order, product, productVariant } from "../../db/schema.ts";
import { getSettings } from "../../settings.ts";
import { orderListColumns } from "./shared.ts";

export const overview = Router();

const DAYS = 30;
const days = (n: number) => sql.raw(String(n));

overview.get("/overview", async (_req, res) => {
  const { inventory } = await getSettings();
  // Revenue is booked on the day an order was paid (Helsinki calendar days).
  const day = sql`(${order.paidAt} at time zone 'UTC' at time zone 'Europe/Helsinki')::date`;
  const today = sql`(now() at time zone 'Europe/Helsinki')::date`;
  const booked = inArray(order.status, ["paid", "fulfilled"]);

  const [daily, [previous], counts, toShip, recent, lowStock, [customers]] = await Promise.all([
    db.execute<{ date: string; revenueCents: number; orders: number }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as "date",
             coalesce(sum(o.total_cents), 0)::int as "revenueCents",
             count(o.id)::int as "orders"
      from generate_series(${today} - ${days(DAYS - 1)}, ${today}, interval '1 day') as d(day)
      left join ${order} o
        on (o.paid_at at time zone 'UTC' at time zone 'Europe/Helsinki')::date = d.day
       and o.status in ('paid', 'fulfilled')
      group by d.day
      order by d.day
    `),
    db
      .select({
        revenueCents: sql<number>`coalesce(sum(${order.totalCents}), 0)::int`,
        orders: sql<number>`count(*)::int`,
      })
      .from(order)
      .where(and(booked, sql`${day} between ${today} - ${days(DAYS * 2 - 1)} and ${today} - ${days(DAYS)}`)),
    db.select({ status: order.status, count: sql<number>`count(*)::int` }).from(order).groupBy(order.status),
    db.select(orderListColumns).from(order).where(eq(order.status, "paid")).orderBy(asc(order.paidAt)).limit(5),
    db.select(orderListColumns).from(order).orderBy(desc(order.createdAt)).limit(6),
    db
      .select({
        sku: productVariant.sku,
        size: productVariant.size,
        stock: productVariant.stock,
        productSlug: product.slug,
        productName: product.name,
      })
      .from(productVariant)
      .innerJoin(product, eq(productVariant.productId, product.id))
      .where(and(eq(product.active, true), lte(productVariant.stock, inventory.lowStockThreshold)))
      .orderBy(asc(productVariant.stock), asc(product.sortOrder))
      .limit(10),
    db
      .select({
        total: sql<number>`count(*)::int`,
        new30: sql<number>`count(*) filter (where ${user.createdAt} >= now() - interval '30 days')::int`,
      })
      .from(user),
  ]);

  const series = daily.rows;
  res.json({
    days: series,
    current: {
      revenueCents: series.reduce((sum, d) => sum + d.revenueCents, 0),
      orders: series.reduce((sum, d) => sum + d.orders, 0),
    },
    previous,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
    customers,
    toShip,
    recent,
    lowStock,
    lowStockThreshold: inventory.lowStockThreshold,
  });
});
