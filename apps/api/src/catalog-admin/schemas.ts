import { z } from "zod";
import {
  CreateVariantBodySchema,
  ProductBodySchema,
  UpdateVariantBodySchema,
} from "@repo/types";

// The request bodies of the admin catalog, built from the shared schemas'
// fields but checked the way the Go binding tags did (internal/types):
//
// - category_id: Go's uuid rule takes any 8-4-4-4-12 hex id, z.uuid() only
//   RFC 9562 ones; an unknown id is a 404 either way.
// - samelen (image_public_ids) and ltfield (offer_price) ran alongside the
//   other rules, so they are reported even when another field is invalid
//   too, and ltfield's message names "Selling price" as Go humanized it.
// - selling_price 0 failed Go's required rule (an int's zero value).
// - The fields are in Go's struct order, so errors come back in its order.

/** Runs a cross-field rule whenever the body is an object, like Go's validator. */
const always = { when: () => true };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sameLen = {
  check(v: unknown) {
    if (!isObject(v)) return true;
    const ids = v.image_public_ids;
    // Go reported only a field's first failing rule: required, min=1, max=5.
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5) return true;
    return ids.length === (Array.isArray(v.images) ? v.images.length : 0);
  },
  params: {
    path: ["image_public_ids"],
    message: "Provide one public ID per image",
    params: { code: "LENGTH_MISMATCH" },
    ...always,
  },
};

const offerBelowPrice = {
  check(v: unknown) {
    if (!isObject(v)) return true;
    const offer = v.offer_price;
    if (typeof offer !== "number" || !Number.isInteger(offer) || offer <= 0)
      return true;
    const price = typeof v.selling_price === "number" ? v.selling_price : 0;
    return offer < price;
  },
  params: {
    path: ["offer_price"],
    message: "Offer price must be less than Selling price",
    params: { code: "OUT_OF_RANGE" },
    ...always,
  },
};

const p = ProductBodySchema.shape;

export const ProductBody = z
  .object({
    name: p.name,
    images: p.images,
    image_public_ids: p.image_public_ids,
    description: p.description,
    features: p.features,
    category_id: z.guid(),
    is_active: p.is_active,
    is_featured: p.is_featured,
  })
  .refine(sameLen.check, sameLen.params);
export type ProductInput = z.output<typeof ProductBody>;

const c = CreateVariantBodySchema.shape;
const u = UpdateVariantBodySchema.shape;

const sellingPrice = z
  .int()
  .refine((n) => n !== 0, {
    message: "Selling price is required",
    params: { code: "REQUIRED_FIELD" },
    abort: true,
  })
  .pipe(u.selling_price);

/** Property names must be unique (Go: unique=Name), checked after max=10. */
const properties = z
  .array(c.properties.unwrap().element)
  .max(10)
  .refine(
    (ps) =>
      ps.length > 10 || new Set(ps.map((x) => x?.name)).size === ps.length,
    {
      message: "Properties must not contain duplicates",
      params: { code: "DUPLICATE_ITEM" },
      ...always,
    },
  )
  .optional();

export const CreateVariantBody = z
  .object({
    images: c.images,
    image_public_ids: c.image_public_ids,
    stock: c.stock,
    selling_price: sellingPrice,
    offer_price: c.offer_price,
    offer_expires_at: c.offer_expires_at,
    is_default: c.is_default,
    is_active: c.is_active,
    properties,
  })
  .refine(sameLen.check, sameLen.params)
  .refine(offerBelowPrice.check, offerBelowPrice.params);
export type CreateVariantInput = z.output<typeof CreateVariantBody>;

export const UpdateVariantBody = z
  .object({
    images: u.images,
    image_public_ids: u.image_public_ids,
    selling_price: sellingPrice,
    offer_price: u.offer_price,
    offer_expires_at: u.offer_expires_at,
    is_default: u.is_default,
    is_active: u.is_active,
  })
  .refine(sameLen.check, sameLen.params)
  .refine(offerBelowPrice.check, offerBelowPrice.params);
export type UpdateVariantInput = z.output<typeof UpdateVariantBody>;
