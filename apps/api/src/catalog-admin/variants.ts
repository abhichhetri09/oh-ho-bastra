import type { Request, Response } from "express";
import {
  clearOtherDefaults,
  createProductVariant,
  createVariantOptionValue,
  deleteVariant,
  getProductByID,
  getProductVariant,
  setVariantStock,
  updateVariant,
  upsertProductOption,
  upsertProductOptionValue,
} from "../db/gen";
import { pgCode, pgConstraint, UNIQUE_VIOLATION, withTx } from "../db/pool";
import type { Deps } from "../deps";
import { pathUuid } from "../http/params";
import { fail, internal, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { SetStockBodySchema } from "@repo/types";
import { generateSku } from "../lib/text";
import { CreateVariantBody, UpdateVariantBody } from "./schemas";

// Port of internal/handlers/variant/admin (and the transactions it ran
// through internal/repository/variant.go).

/** Unique constraints on product_variants (migrations/000006). */
const UNIQUE_COMBINATION = "uq_variant_combination";
const UNIQUE_DEFAULT_VARIANT = "unique_default_product_variant";

/** The :productID and :variantID path parameters, or null after a 400. */
function variantIds(req: Request, res: Response) {
  const productId = pathUuid(
    req,
    res,
    "productID",
    "INVALID_PRODUCT_ID",
    "product ID",
  );
  if (!productId) return null;
  const variantId = pathUuid(
    req,
    res,
    "variantID",
    "INVALID_VARIANT_ID",
    "variant ID",
  );
  if (!variantId) return null;
  return { productId, variantId };
}

/**
 * An offer's optional end. Without an offer there is nothing to expire, so
 * the end is dropped.
 */
const offerExpiry = (offer: number | undefined, ends: string | undefined) =>
  offer === undefined || ends === undefined ? null : ends;

/** Go's sort.Strings: byte-wise (UTF-8) order. */
const byteOrder = (a: string, b: string) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Sorted name=value pairs joined by "|"; "" without options. */
export const combinationKey = (props: { name: string; value: string }[]) =>
  props
    .map((p) => `${p.name}=${p.value}`)
    .sort(byteOrder)
    .join("|");

/**
 * Ends a transaction early with a response: thrown inside withTx so the
 * transaction rolls back, then sent by the handler.
 */
class Reply {
  constructor(readonly send: () => void) {}
}

/** A variant insert/update failure: the unique indexes are 409s. */
function variantError(req: Request, res: Response, err: unknown, msg: string) {
  if (pgCode(err) === UNIQUE_VIOLATION) {
    switch (pgConstraint(err)) {
      case UNIQUE_COMBINATION:
        fail(
          res,
          409,
          "VARIANT_ALREADY_EXISTS",
          "Variant with this combination already exists",
        );
        return;
      case UNIQUE_DEFAULT_VARIANT:
        fail(
          res,
          409,
          "DEFAULT_VARIANT_EXISTS",
          "This product already has a default variant",
        );
        return;
    }
  }
  internal(req, res, msg, err);
}

/** Runs a variant write, rethrowing its failure as the response it maps to. */
async function variantWrite<T>(
  req: Request,
  res: Response,
  msg: string,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (err) {
    throw new Reply(() => variantError(req, res, err, msg));
  }
}

/** Sends a Reply thrown by fn; anything else goes to the error handler. */
async function replying(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Reply) err.send();
    else throw err;
  }
}

export function adminVariantRoutes(variants: Group, deps: Deps) {
  const { db } = deps;

  variants.post("", async (req, res) => {
    const productId = pathUuid(
      req,
      res,
      "productID",
      "INVALID_PRODUCT_ID",
      "product ID",
    );
    if (!productId) return;
    const body = parseBody(CreateVariantBody, req, res);
    if (!body) return;

    const props = body.properties ?? [];
    const key = combinationKey(props);

    await replying(async () => {
      const variant = await withTx(db, async (tx) => {
        const product = await getProductByID(tx, productId);
        if (!product)
          throw new Reply(() =>
            fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found"),
          );

        const sku = generateSku(
          product.name,
          props.map((p) => p.value),
        );

        // A new default takes over from the current one.
        if (body.is_default)
          await clearOtherDefaults(tx, {
            product_id: productId,
            keep_id: null,
          });

        // The SKU's random part makes a collision practically impossible; a
        // unique violation aborts the transaction, so it is not retried here.
        const created = await variantWrite(
          req,
          res,
          "failed to create variant",
          () =>
            createProductVariant(tx, {
              product_id: productId,
              sku,
              stock: body.stock,
              images: body.images,
              image_public_ids: body.image_public_ids,
              selling_price: body.selling_price,
              offer_price: body.offer_price ?? null,
              offer_expires_at: offerExpiry(
                body.offer_price,
                body.offer_expires_at,
              ),
              option_combination_key: key,
              is_default: body.is_default,
              is_active: body.is_active,
            }),
        );
        if (!created) throw new Error("create variant returned no row");

        // Upserts: options and values are shared by the product's variants.
        for (const prop of props) {
          const option = await upsertProductOption(tx, {
            product_id: product.id,
            name: prop.name,
            type: prop.type,
          });
          if (!option) throw new Error("upsert product option returned no row");
          const value = await upsertProductOptionValue(tx, {
            option_id: option.id,
            value: prop.value,
          });
          if (!value) throw new Error("upsert option value returned no row");
          await createVariantOptionValue(tx, {
            variant_id: created.id,
            option_value_id: value.id,
          });
        }
        return created;
      });
      ok(res, 201, "Variant created", variant);
    });
  });

  /**
   * Replaces a variant's images, prices and flags. Its SKU and option
   * combination are fixed at creation, and its stock has its own endpoint.
   * Making it the default takes that from the current default in the same
   * transaction.
   */
  variants.put("/:variantID", async (req, res) => {
    const ids = variantIds(req, res);
    if (!ids) return;
    const body = parseBody(UpdateVariantBody, req, res);
    if (!body) return;

    await replying(async () => {
      const updated = await withTx(db, async (tx) => {
        if (body.is_default) {
          await clearOtherDefaults(tx, {
            product_id: ids.productId,
            keep_id: ids.variantId,
          });
        }
        const row = await variantWrite(
          req,
          res,
          "failed to update variant",
          () =>
            updateVariant(tx, {
              id: ids.variantId,
              product_id: ids.productId,
              images: body.images,
              image_public_ids: body.image_public_ids,
              selling_price: body.selling_price,
              offer_price: body.offer_price ?? null,
              offer_expires_at: offerExpiry(
                body.offer_price,
                body.offer_expires_at,
              ),
              is_default: body.is_default,
              is_active: body.is_active,
            }),
        );
        if (!row)
          throw new Reply(() =>
            fail(res, 404, "VARIANT_NOT_FOUND", "Variant not found"),
          );
        return row;
      });
      ok(res, 200, "Variant updated", updated);
    });
  });

  variants.delete("/:variantID", async (req, res) => {
    const ids = variantIds(req, res);
    if (!ids) return;
    if (
      (await deleteVariant(db, {
        id: ids.variantId,
        product_id: ids.productId,
      })) === 0
    ) {
      fail(res, 404, "VARIANT_NOT_FOUND", "Variant not found");
      return;
    }
    ok(res, 200, "Variant deleted");
  });

  variants.get("/:variantID", async (req, res) => {
    const ids = variantIds(req, res);
    if (!ids) return;
    const variant = await getProductVariant(db, {
      id: ids.variantId,
      product_id: ids.productId,
    });
    if (!variant) {
      fail(res, 404, "VARIANT_NOT_FOUND", "Variant not found");
      return;
    }
    ok(res, 200, "Variant fetched", variant);
  });

  /** Sets a variant's stock to a counted value (not a delta, so retrying is harmless). */
  variants.put("/:variantID/stock", async (req, res) => {
    const ids = variantIds(req, res);
    if (!ids) return;
    const body = parseBody(SetStockBodySchema, req, res);
    if (!body) return;
    const variant = await setVariantStock(db, {
      id: ids.variantId,
      product_id: ids.productId,
      stock: body.stock,
    });
    if (!variant) {
      fail(res, 404, "VARIANT_NOT_FOUND", "Variant not found");
      return;
    }
    ok(res, 200, "Stock updated", variant);
  });
}
