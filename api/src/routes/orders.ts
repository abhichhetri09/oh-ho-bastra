import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import {
  paymentMethodIds,
  paymentMethods,
  shippingOptionIds,
  shippingOptions,
  VAT_RATE_BASIS_POINTS,
  vatIncluded,
} from "../checkout-options.ts";
import { db } from "../db/index.ts";
import { logOrderEvent } from "../db/order-events.ts";
import { productImage } from "../db/schema.ts";
import { lockOrder, releaseStock } from "../db/stock.ts";
import { HttpError } from "../http-error.ts";
import {
  order,
  orderItem,
  payment,
  product,
  productVariant,
} from "../db/schema.ts";
import { createPayment, mockPaymentsEnabled } from "../payments/mock-paytrail.ts";
import { sessionUser } from "../session.ts";
import { checkoutOffer, shippingPrice } from "../settings.ts";

export const orders = Router();

const createOrderBody = z.object({
  email: z.email(),
  phone: z.string().trim().min(5).max(20),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  street: z.string().trim().min(1).max(200),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Finnish postal codes are 5 digits"),
  city: z.string().trim().min(1).max(100),
  shippingMethod: z.enum(shippingOptionIds),
  paymentMethod: z.enum(paymentMethodIds),
  items: z
    .array(
      z.object({
        slug: z.string().min(1),
        size: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
});

orders.get("/checkout/options", async (_req, res) => {
  res.json({
    vatRate: VAT_RATE_BASIS_POINTS / 100,
    ...(await checkoutOffer()),
    // Names for every option, including disabled ones, so old receipts stay readable.
    names: Object.fromEntries([...shippingOptions, ...paymentMethods].map((o) => [o.id, o.name])),
  });
});

orders.post("/orders", async (req, res) => {
  const body = createOrderBody.parse(req.body);
  const user = await sessionUser(req);
  // Only what the store currently offers (see admin settings).
  const offer = await checkoutOffer();
  const shipping = offer.shippingOptions.find((o) => o.id === body.shippingMethod);
  if (!shipping) {
    throw new HttpError(400, "That shipping option is not available");
  }
  if (!offer.paymentMethods.some((m) => m.id === body.paymentMethod)) {
    throw new HttpError(400, "That payment method is not available");
  }

  // Merge duplicate lines so stock is checked once per variant.
  const lines = new Map<string, (typeof body.items)[number]>();
  for (const item of body.items) {
    const key = `${item.slug}:${item.size}`;
    const existing = lines.get(key);
    lines.set(
      key,
      existing
        ? { ...item, quantity: existing.quantity + item.quantity }
        : item,
    );
  }

  const result = await db.transaction(async (tx) => {
    const items = [];
    for (const line of lines.values()) {
      // Reserve stock atomically; no row back means unknown or not enough left.
      const [reserved] = await tx
        .update(productVariant)
        .set({ stock: sql`${productVariant.stock} - ${line.quantity}` })
        .from(product)
        .where(
          and(
            eq(productVariant.productId, product.id),
            eq(product.slug, line.slug),
            eq(product.active, true),
            eq(productVariant.size, line.size),
            sql`${productVariant.stock} >= ${line.quantity}`,
          ),
        )
        .returning({
          variantId: productVariant.id,
          sku: productVariant.sku,
          name: product.name,
          priceCents: sql<number>`coalesce(${productVariant.priceCents}, ${product.priceCents})`,
          swatch: product.swatch,
          imageUrl: sql<string | null>`(select ${productImage.url} from ${productImage} where ${productImage.productId} = ${product.id} order by ${productImage.sortOrder}, ${productImage.id} limit 1)`,
        });
      if (!reserved) {
        throw new HttpError(409, "Not enough stock", {
          slug: line.slug,
          size: line.size,
        });
      }
      items.push({ ...line, ...reserved });
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );
    const shippingCents = shippingPrice(
      shipping.priceCents,
      subtotalCents,
      offer.freeShippingThresholdCents,
    );
    const totalCents = subtotalCents + shippingCents;

    const [created] = await tx
      .insert(order)
      .values({
        id: randomUUID(),
        userId: user?.id,
        email: body.email,
        phone: body.phone,
        firstName: body.firstName,
        lastName: body.lastName,
        street: body.street,
        postalCode: body.postalCode,
        city: body.city,
        shippingMethod: shipping.id,
        subtotalCents,
        shippingCents,
        totalCents,
        vatCents: vatIncluded(totalCents),
      })
      .returning({ id: order.id, number: order.number });

    await tx.insert(orderItem).values(
      items.map((item) => ({
        orderId: created.id,
        variantId: item.variantId,
        productSlug: item.slug,
        productName: item.name,
        size: item.size,
        sku: item.sku,
        unitPriceCents: item.priceCents,
        quantity: item.quantity,
        swatch: item.swatch,
        imageUrl: item.imageUrl,
      })),
    );

    const pending = createPayment(created.number);
    await tx.insert(payment).values({
      id: pending.id,
      orderId: created.id,
      provider: pending.provider,
      method: body.paymentMethod,
      amountCents: totalCents,
      reference: pending.reference,
    });
    await logOrderEvent(tx, created.id, "created", {
      message: `Placed by ${body.email}`,
      actorId: user?.id,
    });

    return { orderId: created.id, paymentUrl: pending.redirectUrl };
  });

  res.status(201).json(result);
});

// The order id is a random UUID, so the URL works as a guest receipt link.
orders.get("/orders/:id", async (req, res) => {
  const [row] = await db.select().from(order).where(eq(order.id, req.params.id));
  if (!row) {
    throw new HttpError(404, "Order not found");
  }
  const items = await db
    .select({
      productSlug: orderItem.productSlug,
      productName: orderItem.productName,
      size: orderItem.size,
      sku: orderItem.sku,
      unitPriceCents: orderItem.unitPriceCents,
      quantity: orderItem.quantity,
      swatch: orderItem.swatch,
      imageUrl: orderItem.imageUrl,
    })
    .from(orderItem)
    .where(eq(orderItem.orderId, row.id))
    .orderBy(orderItem.id);
  const [latestPayment] = await db
    .select({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
    })
    .from(payment)
    .where(eq(payment.orderId, row.id))
    .orderBy(desc(payment.createdAt))
    .limit(1);
  const { userId, ...publicOrder } = row;
  res.json({ ...publicOrder, items, payment: latestPayment ?? null });
});

orders.get("/payments/:id", async (req, res) => {
  const [row] = await db
    .select({
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: order.number,
      method: payment.method,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
      reference: payment.reference,
    })
    .from(payment)
    .innerJoin(order, eq(payment.orderId, order.id))
    .where(eq(payment.id, req.params.id));
  if (!row) {
    throw new HttpError(404, "Payment not found");
  }
  res.json(row);
});

const mockCompleteBody = z.object({
  outcome: z.enum(["paid", "cancelled", "failed"]),
});

orders.post("/payments/:id/mock-complete", async (req, res) => {
  if (!mockPaymentsEnabled()) {
    throw new HttpError(404, "Not found");
  }
  const { outcome } = mockCompleteBody.parse(req.body);

  const result = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ orderId: payment.orderId })
      .from(payment)
      .where(eq(payment.id, req.params.id));
    if (!found) {
      throw new HttpError(404, "Payment not found");
    }
    const locked = await lockOrder(tx, found.orderId);
    const [current] = await tx
      .select({ orderId: payment.orderId, status: payment.status })
      .from(payment)
      .where(eq(payment.id, req.params.id))
      .for("update");
    if (current.status !== "pending") {
      throw new HttpError(409, `Payment is already ${current.status}`);
    }
    if (locked.status !== "pending_payment") {
      throw new HttpError(409, "Order is no longer awaiting payment");
    }

    // Database clock, so timestamps share one timezone however the API is run.
    const now = sql`now()`;
    await tx
      .update(payment)
      .set({ status: outcome, completedAt: now })
      .where(eq(payment.id, req.params.id));

    if (outcome === "paid") {
      await tx
        .update(order)
        .set({ status: "paid", paidAt: now })
        .where(eq(order.id, current.orderId));
      await logOrderEvent(tx, current.orderId, "paid", { message: "Payment approved" });
    } else {
      await logOrderEvent(
        tx,
        current.orderId,
        outcome === "failed" ? "payment_failed" : "payment_cancelled",
        {
          message:
            outcome === "failed"
              ? "Payment declined; order cancelled and stock released"
              : "Buyer cancelled payment; order cancelled and stock released",
        },
      );
      await tx
        .update(order)
        .set({ status: "cancelled" })
        .where(eq(order.id, current.orderId));
      await releaseStock(tx, current.orderId);
    }
    return { orderId: current.orderId, status: outcome };
  });

  res.json(result);
});
