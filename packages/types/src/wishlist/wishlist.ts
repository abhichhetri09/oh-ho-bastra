import { z } from "zod";
import {
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";
import { ProductWithPriceSchema } from "../product/product";

/** The most products a wishlist holds. */
export const MAX_WISHLIST = 200;

export const WishlistProductSchema = ProductWithPriceSchema.extend({
  saved_at: Timestamp,
  variant_count: z
    .int()
    .nonnegative()
    .describe(
      "Active variants; with more than one, a size or colour must be chosen",
    ),
}).meta({
  id: "WishlistProduct",
  description: "A saved product, still on sale.",
});
export type WishlistProduct = z.infer<typeof WishlistProductSchema>;

export const WishlistResponseSchema = paginatedResponse(
  WishlistProductSchema,
).meta({ id: "WishlistResponse" });
export type WishlistResponse = z.infer<typeof WishlistResponseSchema>;

export const WishlistIdsResponseSchema = successResponse(
  z.array(Uuid).describe(`Newest first, at most ${MAX_WISHLIST}`),
).meta({ id: "WishlistIdsResponse" });
export type WishlistIdsResponse = z.infer<typeof WishlistIdsResponseSchema>;
