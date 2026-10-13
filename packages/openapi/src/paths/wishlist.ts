import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { operation } from "./shared.ts";

const tag = "Wishlist";
const productParams = z.object({ productID: Uuid });

export function registerWishlistPaths() {
  operation({
    method: "get",
    path: "/api/v1/wishlist",
    operationId: "listWishlist",
    tag,
    summary: "My saved products",
    description:
      "Saved products that are still on sale, newest saved first, 24 per page.",
    auth: "user",
    request: {
      query: z.object({ page: z.int().min(1).max(100_000).optional() }),
    },
    success: {
      status: 200,
      description: "Wishlist fetched",
      schema: schemas.WishlistResponseSchema,
    },
    errors: { 400: "Invalid page (INVALID_PAGE_PARAMETER)" },
  });

  operation({
    method: "get",
    path: "/api/v1/wishlist/ids",
    operationId: "listWishlistIds",
    tag,
    summary: "Ids of my saved products",
    description:
      "Every saved product id (at most 200), to show saved state on any product card.",
    auth: "user",
    success: {
      status: 200,
      description: "Wishlist fetched",
      schema: schemas.WishlistIdsResponseSchema,
    },
  });

  operation({
    method: "put",
    path: "/api/v1/wishlist/{productID}",
    operationId: "addToWishlist",
    tag,
    summary: "Save a product",
    description: "Saving a saved product changes nothing.",
    auth: "user",
    request: { params: productParams },
    success: {
      status: 200,
      description: "Saved",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_PRODUCT_ID)",
      404: "No such product on sale (PRODUCT_NOT_FOUND)",
      409: "200 products saved already (WISHLIST_FULL)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/wishlist/{productID}",
    operationId: "removeFromWishlist",
    tag,
    summary: "Unsave a product",
    description: "Removing a product that isn't saved succeeds.",
    auth: "user",
    request: { params: productParams },
    success: {
      status: 200,
      description: "Removed",
      schema: schemas.MessageResponseSchema,
    },
    errors: { 400: "Invalid id (INVALID_PRODUCT_ID)" },
  });
}
