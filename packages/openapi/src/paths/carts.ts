import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Cart";
const cart = {
  status: 200 as const,
  description: "The whole cart after the change",
  schema: schemas.CartResponseSchema,
};
const itemParams = z.object({ variantID: Uuid });

export function registerCartPaths() {
  operation({
    method: "get",
    path: "/api/v1/cart",
    operationId: "getCart",
    tag,
    summary: "Get my cart",
    description:
      "One cart per user, priced live; empty until something is added. Capped at 50 lines, so it is not paginated. With a discount code, its discount and any issue are worked out on each read.",
    auth: "user",
    success: { ...cart, description: "Cart fetched" },
  });

  operation({
    method: "delete",
    path: "/api/v1/cart",
    operationId: "clearCart",
    tag,
    summary: "Empty my cart",
    description: "Removes every line; emptying an empty cart succeeds.",
    auth: "user",
    success: cart,
  });

  operation({
    method: "post",
    path: "/api/v1/cart/items",
    operationId: "addCartItem",
    tag,
    summary: "Add to my cart",
    description:
      "Adds to the quantity already in the cart. The stock check counts it; the cart does not reserve stock (checkout does).",
    auth: "user",
    request: body(schemas.AddCartItemBodySchema),
    success: cart,
    errors: {
      400: "Invalid body (VALIDATION_FAILED, INVALID_VARIANT_ID)",
      404: "No such variant (VARIANT_NOT_FOUND)",
      409: "Off sale, not enough stock, more than 10 of the item, or 50 lines already (VARIANT_UNAVAILABLE, INSUFFICIENT_STOCK, CART_QUANTITY_LIMIT, CART_FULL)",
    },
  });

  operation({
    method: "patch",
    path: "/api/v1/cart/items/{variantID}",
    operationId: "updateCartItem",
    tag,
    summary: "Change a line's quantity",
    description:
      "Lowering always works, so a line that went short or off sale can be fixed; raising needs the variant on sale with enough stock.",
    auth: "user",
    request: { params: itemParams, ...body(schemas.UpdateCartItemBodySchema) },
    success: cart,
    errors: {
      400: "Invalid id or body (INVALID_VARIANT_ID, VALIDATION_FAILED)",
      404: "Not in the cart (CART_ITEM_NOT_FOUND)",
      409: "Off sale or not enough stock (VARIANT_UNAVAILABLE, INSUFFICIENT_STOCK)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/cart/items/{variantID}",
    operationId: "removeCartItem",
    tag,
    summary: "Remove a line",
    auth: "user",
    request: { params: itemParams },
    success: cart,
    errors: {
      400: "Invalid id (INVALID_VARIANT_ID)",
      404: "Not in the cart (CART_ITEM_NOT_FOUND)",
    },
  });

  const couponIssues =
    "COUPON_EXPIRED, COUPON_MIN_SUBTOTAL (the message names the amount), COUPON_USED_UP, COUPON_ALREADY_USED";

  operation({
    method: "put",
    path: "/api/v1/cart/coupon",
    operationId: "applyCartCoupon",
    tag,
    summary: "Apply a discount code",
    description:
      "Checks the code against the bag as it is now and puts it on the bag, replacing any other (one code per bag). Codes are case-insensitive. Failed attempts are limited to 10 per 15 minutes per user, against guessing.",
    auth: "user",
    request: body(schemas.ApplyCouponBodySchema),
    success: { ...cart, description: "Code applied" },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "No such code, or it isn't active (COUPON_NOT_FOUND)",
      409: `The code can't be used (${couponIssues})`,
      429: "Too many failed codes (TOO_MANY_REQUESTS)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/cart/coupon",
    operationId: "removeCartCoupon",
    tag,
    summary: "Remove the discount code",
    description: "Removing when there is none succeeds.",
    auth: "user",
    success: { ...cart, description: "Code removed" },
  });

  operation({
    method: "put",
    path: "/api/v1/cart/referral",
    operationId: "applyCartReferral",
    tag,
    summary: "Apply a friend's referral code",
    description:
      "Checks the code against the bag and the buyer (a first order, not the referrer) and puts it on the bag, replacing any other; the storefront does this for a shopper who came through a shared link. One discount per order: it counts only when it takes off more than the bag's discount code. A bag below the friend's minimum keeps it, with the issue. Failed attempts are limited as discount codes are.",
    auth: "user",
    request: body(schemas.ApplyReferralBodySchema),
    success: { ...cart, description: "Friend's discount added" },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "No such code, or the programme is off (REFERRAL_NOT_FOUND)",
      409: "The code can't be used (REFERRAL_OWN_CODE, REFERRAL_NOT_FIRST_ORDER)",
      429: "Too many failed codes (TOO_MANY_REQUESTS)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/cart/referral",
    operationId: "removeCartReferral",
    tag,
    summary: "Remove the friend's referral code",
    description: "Removing when there is none succeeds.",
    auth: "user",
    success: { ...cart, description: "Friend's discount removed" },
  });
}
