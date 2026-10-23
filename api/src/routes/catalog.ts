import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/index.ts";
import { imagesByProduct } from "../db/product-images.ts";
import { collection, product, productVariant } from "../db/schema.ts";

export const catalog = Router();

const collectionColumns = {
  slug: collection.slug,
  name: collection.name,
  description: collection.description,
  blurb: collection.blurb,
  swatch: collection.swatch,
  imageUrl: collection.imageUrl,
};

async function listProducts(where?: SQL) {
  const rows = await db
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
      swatch: product.swatch,
    })
    .from(product)
    .innerJoin(collection, eq(product.collectionId, collection.id))
    .where(and(eq(product.active, true), where))
    .orderBy(asc(collection.sortOrder), asc(product.sortOrder));

  if (rows.length === 0) {
    return [];
  }

  const variants = await db
    .select({
      productId: productVariant.productId,
      size: productVariant.size,
      sku: productVariant.sku,
      stock: productVariant.stock,
      priceOverride: productVariant.priceCents,
    })
    .from(productVariant)
    .where(
      inArray(
        productVariant.productId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(productVariant.sortOrder));

  const images = await imagesByProduct(rows.map((row) => row.id));

  return rows.map(({ id, ...row }) => ({
    ...row,
    images: images.get(id) ?? [],
    variants: variants
      .filter((variant) => variant.productId === id)
      // Every size carries its actual price, override or base.
      .map(({ productId, priceOverride, ...variant }) => ({
        ...variant,
        priceCents: priceOverride ?? row.priceCents,
      })),
  }));
}

catalog.get("/collections", async (_req, res) => {
  const rows = await db
    .select(collectionColumns)
    .from(collection)
    .orderBy(asc(collection.sortOrder));
  res.json(rows);
});

catalog.get("/collections/:slug", async (req, res) => {
  const [row] = await db
    .select(collectionColumns)
    .from(collection)
    .where(eq(collection.slug, req.params.slug));
  if (!row) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }
  const products = await listProducts(eq(collection.slug, row.slug));
  res.json({ ...row, products });
});

catalog.get("/products", async (req, res) => {
  const slug = req.query.collection;
  const products = await listProducts(
    typeof slug === "string" ? eq(collection.slug, slug) : undefined,
  );
  res.json(products);
});

catalog.get("/products/:slug", async (req, res) => {
  const [current] = await listProducts(eq(product.slug, req.params.slug));
  if (!current) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const others = (await listProducts()).filter(
    (item) => item.slug !== current.slug,
  );
  const related = [
    ...others.filter((item) => item.collection === current.collection),
    ...others.filter((item) => item.collection !== current.collection),
  ].slice(0, 3);
  res.json({ ...current, related });
});
