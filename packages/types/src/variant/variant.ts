import { z } from "zod";
import { Cents, successResponse, Timestamp, Uuid } from "../api/response";
import {
  ProductDetailSchema,
  ProductWithPriceSchema,
  VariantOptionSchema,
} from "../product/product";

export const ProductVariantSchema = z
  .object({
    id: Uuid,
    product_id: Uuid,
    sku: z.string().nullable(),
    stock: z.int().nonnegative(),
    images: z.array(z.url()),
    image_public_ids: z.array(z.string()),
    selling_price: Cents,
    offer_price: Cents.nullable(),
    is_default: z.boolean(),
    is_active: z.boolean(),
    created_at: Timestamp,
    updated_at: Timestamp,
    option_combination_key: z
      .string()
      .describe('Sorted `name=value` pairs joined by `|`; "" without options.'),
    offer_expires_at: Timestamp.nullable(),
    blank_id: Uuid.nullable().describe(
      "The blank it is printed on, whose stock it shares; null keeps its own stock.",
    ),
  })
  .meta({ id: "ProductVariant" });
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const StorefrontVariantSchema = z
  .object({
    id: Uuid,
    product_id: Uuid,
    sku: z.string().nullable(),
    stock: z.int().nonnegative(),
    images: z.array(z.url()),
    selling_price: Cents,
    offer_price: Cents.nullable().describe("The active offer, or null"),
    price: Cents.describe("What the customer pays"),
    offer_expires_at: Timestamp.nullable().describe(
      "When the offer ends; null for an open-ended offer",
    ),
    is_default: z.boolean(),
    created_at: Timestamp,
    options: z.array(VariantOptionSchema),
    blank_id: Uuid.nullable()
      .optional()
      .describe(
        "The blank it is printed on: variants on one blank share its stock",
      ),
  })
  .meta({
    id: "StorefrontVariant",
    description: "A variant on the storefront, with its option values.",
  });
export type StorefrontVariant = z.infer<typeof StorefrontVariantSchema>;

export const VariantPropertySchema = z
  .object({
    name: z.string().trim().min(2).max(20),
    value: z.string().trim().min(1).max(20),
    type: z.enum(["text", "color"]),
  })
  .meta({ id: "VariantProperty" });
export type VariantProperty = z.infer<typeof VariantPropertySchema>;

// Prices are integer cents.
const variantFields = {
  images: z.array(z.url()).min(1).max(5),
  image_public_ids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(5)
    .describe("Cloudinary public IDs, one per image, in the same order"),
  selling_price: z.int().positive().max(100_000_000),
  offer_price: z
    .int()
    .positive()
    .optional()
    .describe("Must be below selling_price; omit for no offer."),
  offer_expires_at: Timestamp.optional().describe(
    "When the offer ends; omit for an open-ended offer. Ignored without an offer.",
  ),
  is_default: z
    .boolean()
    .describe(
      "A product has at most one default: setting it takes it from the current one.",
    ),
  is_active: z.boolean(),
  blank_id: Uuid.nullable()
    .optional()
    .describe(
      "A blank to print on: the variant then shares the blank's stock. Omit or null for a variant with its own stock.",
    ),
};

type VariantFields = {
  images: string[];
  image_public_ids: string[];
  selling_price: number;
  offer_price?: number | undefined;
};

const checkVariant = (b: VariantFields, ctx: z.RefinementCtx) => {
  if (b.image_public_ids.length !== b.images.length) {
    ctx.addIssue({
      code: "custom",
      path: ["image_public_ids"],
      message: "Provide one public ID per image",
      params: { code: "LENGTH_MISMATCH" },
    });
  }
  if (b.offer_price !== undefined && b.offer_price >= b.selling_price) {
    ctx.addIssue({
      code: "custom",
      path: ["offer_price"],
      message: "Offer price must be less than selling price",
      params: { code: "OUT_OF_RANGE" },
    });
  }
};

const variantProperties = z
  .array(VariantPropertySchema)
  .max(10)
  .refine((p) => new Set(p.map((x) => x.name)).size === p.length, {
    message: "Properties must not contain duplicates",
    params: { code: "DUPLICATE_ITEM" },
  })
  .optional()
  .describe("Option values that identify the variant; names must be unique.");

/** A new variant needs a stock count unless a blank supplies it. */
export const checkStock = (
  b: { stock?: number | undefined; blank_id?: string | null | undefined },
  ctx: z.RefinementCtx,
) => {
  if (b.stock === undefined && !b.blank_id) {
    ctx.addIssue({
      code: "custom",
      path: ["stock"],
      message: "Stock is required without a blank",
      params: { code: "REQUIRED_FIELD" },
    });
  }
};

export const CreateVariantBodySchema = z
  .object({
    ...variantFields,
    stock: z
      .int()
      .min(0)
      .max(10000)
      .optional()
      .describe("Required without a blank; with one, the blank's is used."),
    properties: variantProperties,
  })
  .superRefine(checkVariant)
  .superRefine(checkStock)
  .meta({ id: "CreateVariantBody", description: "Prices are integer cents." });
export type CreateVariantBody = z.infer<typeof CreateVariantBodySchema>;

export const UpdateVariantBodySchema = z
  .object({
    ...variantFields,
    properties: variantProperties.describe(
      "New option values; omit to keep them. Another variant of the product with the same values is a 409.",
    ),
  })
  .superRefine(checkVariant)
  .meta({
    id: "UpdateVariantBody",
    description:
      "The SKU is fixed at creation; stock has its own endpoint. A blank_id left out unlinks the blank (this replaces the variant).",
  });
export type UpdateVariantBody = z.infer<typeof UpdateVariantBodySchema>;

export const SetStockBodySchema = z
  .object({ stock: z.int().min(0).max(10_000) })
  .meta({
    id: "SetStockBody",
    description: "The counted stock (an absolute value, not a change).",
  });
export type SetStockBody = z.infer<typeof SetStockBodySchema>;

export const SetPriceBodySchema = z
  .object({ selling_price: z.int().positive().max(100_000_000) })
  .meta({
    id: "SetPriceBody",
    description:
      "The selling price in cents; an offer on the variant must stay below it.",
  });
export type SetPriceBody = z.infer<typeof SetPriceBodySchema>;

export const AdminVariantSchema = ProductVariantSchema.extend({
  options: z.array(VariantOptionSchema),
}).meta({
  id: "AdminVariant",
  description: "A variant, active or not, with its options.",
});
export type AdminVariant = z.infer<typeof AdminVariantSchema>;

export const AdminVariantListResponseSchema = successResponse(
  z.array(AdminVariantSchema).describe("Default first, then oldest first"),
).meta({ id: "AdminVariantListResponse" });

export const VariantResponseSchema = successResponse(ProductVariantSchema).meta(
  { id: "VariantResponse" },
);
export type VariantResponse = z.infer<typeof VariantResponseSchema>;

export const ProductPageSchema = z
  .object({
    product_detail: ProductDetailSchema,
    variants: z
      .array(StorefrontVariantSchema)
      .describe("Active variants, default first; options sorted by name"),
    related_products: z
      .array(ProductWithPriceSchema)
      .describe("Up to 8 visible products from the same category"),
  })
  .meta({
    id: "ProductPage",
    description: "Everything the product page needs.",
  });
export type ProductPage = z.infer<typeof ProductPageSchema>;

export const ProductPageResponseSchema = successResponse(
  ProductPageSchema,
).meta({ id: "ProductPageResponse" });
export type ProductPageResponse = z.infer<typeof ProductPageResponseSchema>;
