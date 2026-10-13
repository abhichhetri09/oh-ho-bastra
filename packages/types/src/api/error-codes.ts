import { z } from "zod";

/**
 * Codes in the `code` field of failed responses. Must list exactly the Go
 * constants in apps/api/internal/constants/error_codes.go; the API's
 * contract test fails otherwise.
 */
export const ErrorCodeSchema = z
  .enum([
    // general
    "INTERNAL_SERVER_ERROR",
    "VALIDATION_FAILED",
    "INVALID_PAGE_PARAMETER",
    "INVALID_PRICE_FILTER",
    "INVALID_QUERY_PARAMETER",
    "ROUTE_NOT_FOUND",
    "METHOD_NOT_ALLOWED",
    // auth
    "INVALID_CREDENTIALS",
    "MISSING_REFRESH_TOKEN",
    "INVALID_REFRESH_TOKEN",
    "USER_ALREADY_EXISTS",
    "FORBIDDEN",
    "INVALID_TOKEN_CLAIMS",
    "USER_NOT_FOUND",
    "INVALID_USER_ID",
    "CUSTOMER_NOT_FOUND",
    "MISSING_ACCESS_TOKEN",
    "INVALID_ACCESS_TOKEN",
    "INVALID_RESET_TOKEN",
    "MAIL_UNAVAILABLE",
    // product
    "PRODUCT_NOT_FOUND",
    "INVALID_PRODUCT_ID",
    // variant
    "VARIANT_NOT_FOUND",
    "INVALID_VARIANT_ID",
    "VARIANT_ALREADY_EXISTS",
    "DEFAULT_VARIANT_EXISTS",
    // category
    "CATEGORY_NOT_FOUND",
    "INVALID_CATEGORY_ID",
    "CATEGORY_ALREADY_EXISTS",
    "SELF_REFERENCING_CATEGORY",
    "CYCLIC_CATEGORY_REFERENCE",
    // cart
    "VARIANT_UNAVAILABLE",
    "INSUFFICIENT_STOCK",
    "CART_QUANTITY_LIMIT",
    "CART_FULL",
    "CART_ITEM_NOT_FOUND",
    // checkout and orders
    "CART_EMPTY",
    "CART_HAS_ISSUES",
    "PAYMENTS_UNAVAILABLE",
    "PAYMENT_PROVIDER_ERROR",
    "INVALID_WEBHOOK_SIGNATURE",
    "INVALID_SESSION_ID",
    "ORDER_NOT_FOUND",
    "INVALID_ORDER_TRANSITION",
    "ORDER_ALREADY_PAID",
    "REFUND_REFUSED",
    "INVALID_ORDER_NUMBER",
    "ADDRESS_NOT_FOUND",
    "INVALID_ADDRESS_ID",
    // wishlist
    "INVALID_EMAIL_ID",
    "EMAIL_NOT_FOUND",
    "EMAIL_NOT_FAILED",
    "WISHLIST_FULL",
    // reviews
    "NOT_VERIFIED_BUYER",
    "REVIEW_NOT_FOUND",
    "INVALID_REVIEW_ID",
  ])
  .meta({ id: "ErrorCode", description: "Machine-readable failure code." });

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
