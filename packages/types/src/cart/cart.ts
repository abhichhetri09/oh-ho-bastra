import { z } from "zod";
import { Cents, successResponse, Timestamp, Uuid } from "../api/response";
import { VariantOptionSchema } from "../product/product";

/** The most of one variant a cart line can hold. */
export const MAX_LINE_QUANTITY = 10;

export const CartLineSchema = z
  .object({
    variant_id: Uuid,
    quantity: z.int().positive(),
    added_at: Timestamp,
    product_id: Uuid,
    product_name: z.string(),
    product_slug: z.string(),
    sku: z.string().nullable(),
    stock: z.int().nonnegative(),
    image: z
      .string()
      .describe("The variant's first image, else the product's; \"\" if none"),
    selling_price: Cents,
    offer_price: Cents.nullable().describe("The active offer, or null"),
    price: Cents.describe("What one costs right now"),
    available: z
      .boolean()
      .describe("False once the variant or its product is off sale"),
    options: z.array(VariantOptionSchema),
    line_total: z.int().nonnegative().describe("price × quantity"),
    max_quantity: z
      .int()
      .nonnegative()
      .describe(
        `What the line can be raised to: the stock, at most ${MAX_LINE_QUANTITY}; 0 when it can't be bought`,
      ),
  })
  .meta({ id: "CartLine", description: "One cart line, priced live." });
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z
  .object({
    items: z.array(CartLineSchema).describe("Oldest first, at most 50"),
    item_count: z
      .int()
      .nonnegative()
      .describe("Units in the lines that can be checked out"),
    subtotal: z
      .int()
      .nonnegative()
      .describe("Cents, over the lines that can be checked out"),
    has_issues: z
      .boolean()
      .describe(
        "A line is off sale or above its stock; checkout refuses until it is fixed",
      ),
  })
  .meta({ id: "Cart" });
export type Cart = z.infer<typeof CartSchema>;

// Mirrors apps/api/internal/types/cart.go.
export const AddCartItemBodySchema = z
  .object({
    variant_id: Uuid,
    quantity: z.int().min(1).max(MAX_LINE_QUANTITY),
  })
  .meta({
    id: "AddCartItemBody",
    description: "Adds to the quantity already in the cart.",
  });
export type AddCartItemBody = z.infer<typeof AddCartItemBodySchema>;

export const UpdateCartItemBodySchema = z
  .object({
    quantity: z.int().min(1).max(MAX_LINE_QUANTITY),
  })
  .meta({ id: "UpdateCartItemBody" });
export type UpdateCartItemBody = z.infer<typeof UpdateCartItemBodySchema>;

export const CartResponseSchema = successResponse(CartSchema).meta({
  id: "CartResponse",
});
export type CartResponse = z.infer<typeof CartResponseSchema>;
