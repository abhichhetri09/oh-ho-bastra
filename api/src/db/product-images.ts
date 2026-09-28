import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./index.ts";
import { productImage } from "./schema.ts";
import type { Tx } from "./stock.ts";

export type ImageInput = { url: string; alt: string };

/** Photos for many products at once, grouped by product id in display order. */
export async function imagesByProduct(productIds: number[]) {
  const map = new Map<number, ImageInput[]>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({ productId: productImage.productId, url: productImage.url, alt: productImage.alt })
    .from(productImage)
    .where(inArray(productImage.productId, productIds))
    .orderBy(asc(productImage.productId), asc(productImage.sortOrder), asc(productImage.id));
  for (const { productId, ...image } of rows) {
    map.set(productId, [...(map.get(productId) ?? []), image]);
  }
  return map;
}

/** Replaces a product's photos with `images`, in that order. */
export async function replaceImages(tx: Tx, productId: number, images: ImageInput[]) {
  await tx.delete(productImage).where(eq(productImage.productId, productId));
  if (images.length) {
    await tx.insert(productImage).values(images.map((image, sortOrder) => ({ productId, ...image, sortOrder })));
  }
}
