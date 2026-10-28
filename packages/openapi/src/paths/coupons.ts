import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Admin";
const id = z.object({ couponID: Uuid });
const coupon = {
  status: 200 as const,
  description: "The coupon as it now is",
  schema: schemas.AdminCouponResponseSchema,
};
const notFound = "No such coupon (COUPON_NOT_FOUND)";
const duplicate =
  "Another coupon has the code (COUPON_ALREADY_EXISTS, with the field in errors)";

export function registerCouponPaths() {
  operation({
    method: "get",
    path: "/api/v1/admin/coupons",
    operationId: "adminListCoupons",
    tag,
    summary: "Discount codes",
    description:
      "Newest first, 20 per page, each with its uses (unpaid checkouts hold theirs until they are cancelled).",
    auth: "admin",
    request: {
      query: z.object({ page: z.int().min(1).max(100_000).optional() }),
    },
    success: {
      status: 200,
      description: "Coupons fetched",
      schema: schemas.AdminCouponListResponseSchema,
    },
    errors: { 400: "Invalid page (INVALID_PAGE_PARAMETER)" },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/coupons",
    operationId: "adminCreateCoupon",
    tag,
    summary: "Create a discount code",
    auth: "admin",
    request: body(schemas.CouponBodySchema),
    success: { ...coupon, status: 201, description: "Coupon created" },
    errors: { 400: "Invalid body (VALIDATION_FAILED)", 409: duplicate },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/coupons/{couponID}",
    operationId: "adminUpdateCoupon",
    tag,
    summary: "Change a discount code",
    description:
      "Replaces every field. Orders keep the code and discount they were placed with; bags holding the old code see it checked against the new rules.",
    auth: "admin",
    request: { params: id, ...body(schemas.CouponBodySchema) },
    success: { ...coupon, description: "Coupon updated" },
    errors: {
      400: "Invalid id or body (INVALID_COUPON_ID, VALIDATION_FAILED)",
      404: notFound,
      409: duplicate,
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/coupons/{couponID}/active",
    operationId: "adminSetCouponActive",
    tag,
    summary: "Switch a discount code on or off",
    description:
      "A code that is off can't be applied or checked out with; to shoppers it doesn't exist.",
    auth: "admin",
    request: { params: id, ...body(schemas.CouponActiveBodySchema) },
    success: { ...coupon, description: "Coupon updated" },
    errors: {
      400: "Invalid id or body (INVALID_COUPON_ID, VALIDATION_FAILED)",
      404: notFound,
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/admin/coupons/{couponID}",
    operationId: "adminDeleteCoupon",
    tag,
    summary: "Delete a discount code",
    description:
      "Only a code that was never used; one that was is switched off instead, so its orders keep their record.",
    auth: "admin",
    request: { params: id },
    success: {
      status: 200,
      description: "Coupon deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_COUPON_ID)",
      404: notFound,
      409: "The code has been used (COUPON_IN_USE)",
    },
  });
}
