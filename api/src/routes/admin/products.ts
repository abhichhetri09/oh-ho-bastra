import { asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../../db/index.ts";
import { collection, product, productVariant } from "../../db/schema.ts";
import { imagesByProduct, replaceImages } from "../../db/product-images.ts";
import { HttpError } from "../../http-error.ts";

export const adminProducts = Router();

adminProducts.get("/products", async (_req, res) => {
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      collection: collection.name,
      priceCents: product.priceCents,
      currency: product.currency,
      active: product.active,
      swatch: product.swatch,
    })
    .from(product)
    .innerJoin(collection, eq(product.collectionId, collection.id))
    .orderBy(asc(collection.sortOrder), asc(product.sortOrder));
  const variants = await db
    .select({
      productId: productVariant.productId,
      size: productVariant.size,
      sku: productVariant.sku,
      stock: productVariant.stock,
      priceCents: productVariant.priceCents,
    })
    .from(productVariant)
    .orderBy(asc(productVariant.sortOrder));
  const images = await imagesByProduct(rows.map((row) => row.id));
  res.json(
    rows.map(({ id, ...row }) => ({
      ...row,
      imageUrl: images.get(id)?.[0]?.url ?? null,
      variants: variants
        .filter((v) => v.productId === id)
        .map(({ productId, ...v }) => v),
    })),
  );
});

const productPatch = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2000),
    priceCents: z.number().int().min(1).max(1_000_000),
    active: z.boolean(),
  })
  .partial();

adminProducts.patch("/products/:slug", async (req, res) => {
  const patch = productPatch.parse(req.body);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "Nothing to update");
  }
  const [row] = await db
    .update(product)
    .set(patch)
    .where(eq(product.slug, req.params.slug))
    .returning({ slug: product.slug });
  if (!row) {
    throw new HttpError(404, "Product not found");
  }
  res.json(row);
});

const variantPatch = z.object({ stock: z.number().int().min(0).max(100_000) });

adminProducts.patch("/variants/:sku", async (req, res) => {
  const { stock } = variantPatch.parse(req.body);
  const [row] = await db
    .update(productVariant)
    .set({ stock })
    .where(eq(productVariant.sku, req.params.sku))
    .returning({ sku: productVariant.sku, stock: productVariant.stock });
  if (!row) {
    throw new HttpError(404, "Variant not found");
  }
  res.json(row);
});

const swatchSchema = z.object({
  from: z.string().max(40),
  to: z.string().max(40),
  sheen: z.string().max(60),
  fold: z.string().max(40),
});

const variantsSchema = z
  .array(
    z.object({
      size: z.string().trim().min(1).max(10),
      stock: z.number().int().min(0).max(100_000),
      // Null (or left out) = use the product's base price.
      priceCents: z.number().int().min(1).max(1_000_000).nullable().optional(),
    }),
  )
  .min(1, "Add at least one size")
  .max(20)
  .refine((v) => new Set(v.map((x) => x.size.toUpperCase())).size === v.length, "Sizes must be unique");

const productBody = z.object({
  name: z.string().trim().min(1).max(120),
  collection: z.string().min(1),
  description: z.string().trim().min(1).max(2000),
  color: z.string().trim().min(1).max(40),
  fabric: z.string().trim().min(1).max(80),
  fit: z.string().trim().min(1).max(40),
  weight: z.string().trim().min(1).max(40),
  care: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(1).max(1_000_000),
  active: z.boolean(),
  // Optional fallback artwork; photos are the main visual.
  swatch: swatchSchema.nullable().optional(),
  images: z
    .array(
      z.object({
        // Our own uploads, or seed photos served from the same place.
        url: z.string().regex(/^\/api\/uploads\/[\w./-]+$/, "Upload the photo first"),
        alt: z.string().trim().max(200).default(""),
      }),
    )
    .max(12, "Up to 12 photos"),
  variants: variantsSchema,
});

const createBody = productBody.extend({
  // Optional; derived from the name when left out.
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
    .max(80)
    .optional(),
});

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function collectionId(slug: string) {
  const [row] = await db.select({ id: collection.id }).from(collection).where(eq(collection.slug, slug));
  if (!row) throw new HttpError(400, "Unknown collection");
  return row.id;
}

adminProducts.get("/products/:slug", async (req, res) => {
  const [row] = await db
    .select({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      collection: collection.slug,
      color: product.color,
      fabric: product.fabric,
      fit: product.fit,
      weight: product.weight,
      care: product.care,
      priceCents: product.priceCents,
      currency: product.currency,
      active: product.active,
      swatch: product.swatch,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      // Units sold across paid and shipped orders.
      unitsSold: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_item oi join "order" o on o.id = oi.order_id where oi.product_slug = ${product.slug} and o.status in ('paid', 'fulfilled'))`,
    })
    .from(product)
    .innerJoin(collection, eq(product.collectionId, collection.id))
    .where(eq(product.slug, req.params.slug));
  if (!row) throw new HttpError(404, "Product not found");
  const variants = await db
    .select({
      size: productVariant.size,
      sku: productVariant.sku,
      stock: productVariant.stock,
      priceCents: productVariant.priceCents,
    })
    .from(productVariant)
    .where(eq(productVariant.productId, row.id))
    .orderBy(asc(productVariant.sortOrder));
  const images = (await imagesByProduct([row.id])).get(row.id) ?? [];
  const { id, ...rest } = row;
  res.json({ ...rest, images, variants });
});

adminProducts.post("/products", async (req, res) => {
  const { slug: givenSlug, collection: collectionSlug, variants, images, ...fields } = createBody.parse(req.body);
  const slug = givenSlug || slugify(fields.name);
  if (!slug) throw new HttpError(400, "Give the product a name with letters or numbers");
  const [taken] = await db.select({ id: product.id }).from(product).where(eq(product.slug, slug));
  if (taken) throw new HttpError(409, `A product with the URL “${slug}” already exists`);
  const collectionIdValue = await collectionId(collectionSlug);

  const created = await db.transaction(async (tx) => {
    const [{ maxOrder }] = await tx
      .select({ maxOrder: sql<number>`coalesce(max(${product.sortOrder}), -1)::int` })
      .from(product)
      .where(eq(product.collectionId, collectionIdValue));
    const [row] = await tx
      .insert(product)
      .values({ ...fields, slug, collectionId: collectionIdValue, sortOrder: maxOrder + 1 })
      .returning({ id: product.id, slug: product.slug });
    await replaceImages(tx, row.id, images);
    await tx.insert(productVariant).values(
      variants.map((v, index) => ({
        productId: row.id,
        size: v.size.toUpperCase(),
        sku: `${slug}-${v.size}`.toUpperCase(),
        stock: v.stock,
        priceCents: v.priceCents ?? null,
        sortOrder: index,
      })),
    );
    return row;
  });
  res.status(201).json({ slug: created.slug });
});

adminProducts.put("/products/:slug", async (req, res) => {
  const { collection: collectionSlug, variants, images, ...fields } = productBody.parse(req.body);
  const [existing] = await db.select({ id: product.id, slug: product.slug }).from(product).where(eq(product.slug, req.params.slug));
  if (!existing) throw new HttpError(404, "Product not found");
  const collectionIdValue = await collectionId(collectionSlug);

  await db.transaction(async (tx) => {
    await tx.update(product).set({ ...fields, collectionId: collectionIdValue }).where(eq(product.id, existing.id));
    await replaceImages(tx, existing.id, images);
    // Sizes are kept once created (past orders point at them); new ones are added,
    // existing ones get their stock, price and order updated.
    for (const [index, v] of variants.entries()) {
      const size = v.size.toUpperCase();
      const priceCents = v.priceCents ?? null;
      await tx
        .insert(productVariant)
        .values({ productId: existing.id, size, sku: `${existing.slug}-${size}`.toUpperCase(), stock: v.stock, priceCents, sortOrder: index })
        .onConflictDoUpdate({
          target: [productVariant.productId, productVariant.size],
          set: { stock: v.stock, priceCents, sortOrder: index },
        });
    }
  });
  res.json({ slug: existing.slug });
});
