import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const unavailable = "Payments are not configured (PAYMENTS_UNAVAILABLE)";

export function registerCheckoutPaths() {
  operation({
    method: "post",
    path: "/api/v1/checkout",
    operationId: "startCheckout",
    tag: "Checkout",
    summary: "Start checkout",
    description:
      "Reserves the cart's stock in a pending order (replacing the user's unpaid checkouts) and opens a Stripe Checkout page for 31 minutes. The cart's discount code is checked again and its use held by the order until it is paid or cancelled. Send the shopper to `checkout_url`; Stripe returns them to /checkout/success or /cart. The cart is emptied of the bought lines (and its code) once payment lands. The order's email (where its emails go, Stripe's receipt email, and who a once-per-customer code counts) is the account's; a guest gives it as `email` and ships to a new `address` (nothing is saved).",
    auth: "user",
    request: body(schemas.CheckoutBodySchema),
    success: {
      status: 201,
      description: "Checkout started",
      schema: schemas.CheckoutResponseSchema,
    },
    errors: {
      400: "Invalid body, not exactly one of address_id and address, or a guest without an email or with an address_id (VALIDATION_FAILED)",
      404: "No such saved address (ADDRESS_NOT_FOUND)",
      409: "The cart is empty, a line is off sale or short, or its discount code can't be used (CART_EMPTY, CART_HAS_ISSUES, COUPON_NOT_FOUND, COUPON_EXPIRED, COUPON_MIN_SUBTOTAL, COUPON_USED_UP, COUPON_ALREADY_USED)",
      502: "Stripe could not be reached; the reservation was released (PAYMENT_PROVIDER_ERROR)",
      503: unavailable,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/checkout/sessions/{sessionID}",
    operationId: "getCheckoutSession",
    tag: "Checkout",
    summary: "The order behind a checkout",
    description:
      "For the success page. A pending order is first checked with Stripe, so it turns paid even before the webhook arrives.",
    auth: "user",
    request: {
      params: z.object({ sessionID: z.string().describe("cs_…") }),
    },
    success: {
      status: 200,
      description: "Order fetched",
      schema: schemas.OrderDetailResponseSchema,
    },
    errors: {
      400: "Not a checkout session id (INVALID_SESSION_ID)",
      404: "No order of yours for that session (ORDER_NOT_FOUND)",
      503: unavailable,
    },
  });

  operation({
    method: "post",
    path: "/api/v1/webhooks/stripe",
    operationId: "stripeWebhook",
    tag: "Checkout",
    summary: "Stripe webhook",
    description:
      "Called by Stripe, authenticated by the Stripe-Signature header. Handles checkout.session.completed, async_payment_succeeded, expired and async_payment_failed; each event id is applied once. A 500 makes Stripe retry.",
    request: {
      headers: z.object({ "stripe-signature": z.string() }),
    },
    success: {
      status: 200,
      description: "Event received",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Missing or wrong signature (INVALID_WEBHOOK_SIGNATURE)",
      503: unavailable,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/orders",
    operationId: "listOrders",
    tag: "Orders",
    summary: "My orders",
    description:
      "Placed orders, newest first, 10 per page. Abandoned checkouts are left out.",
    auth: "user",
    request: {
      query: z.object({
        page: z.int().min(1).max(100_000).optional(),
      }),
    },
    success: {
      status: 200,
      description: "Orders fetched",
      schema: schemas.OrderListResponseSchema,
    },
    errors: { 400: "Invalid page (INVALID_PAGE_PARAMETER)" },
  });

  operation({
    method: "get",
    path: "/api/v1/orders/{number}",
    operationId: "getOrder",
    tag: "Orders",
    summary: "One of my orders",
    auth: "user",
    request: { params: z.object({ number: z.int().positive() }) },
    success: {
      status: 200,
      description: "Order fetched",
      schema: schemas.OrderDetailResponseSchema,
    },
    errors: {
      400: "Invalid order number (INVALID_ORDER_NUMBER)",
      404: "No order of yours with that number (ORDER_NOT_FOUND)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/orders/lookup",
    operationId: "lookupOrder",
    tag: "Orders",
    summary: "Find an order by number and email",
    description:
      "For shoppers without an account (the order tracking page): the placed order with that number and email (any case), as GET /orders/{number} answers it, with `reviewed_product_ids` empty. A wrong email answers the same 404 as an unknown number. Abandoned checkouts aren't found.",
    request: body(schemas.OrderLookupBodySchema),
    success: {
      status: 200,
      description: "Order fetched",
      schema: schemas.OrderDetailResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "No order with that number and email (ORDER_NOT_FOUND)",
      429: "Too many lookups that found nothing from this address (TOO_MANY_REQUESTS); see Retry-After",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/addresses",
    operationId: "listAddresses",
    tag: "Orders",
    summary: "My saved addresses",
    description:
      "Saved at checkout with save_address; at most 10. The default comes first, then the newest.",
    auth: "account",
    success: {
      status: 200,
      description: "Addresses fetched",
      schema: schemas.AddressListResponseSchema,
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/addresses/{addressID}",
    operationId: "deleteAddress",
    tag: "Orders",
    summary: "Delete a saved address",
    description: "Orders keep their own copy of the address.",
    auth: "account",
    request: { params: z.object({ addressID: Uuid }) },
    success: {
      status: 200,
      description: "Address deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_ADDRESS_ID)",
      404: "No such address of yours (ADDRESS_NOT_FOUND)",
    },
  });

  operation({
    method: "put",
    path: "/api/v1/addresses/{addressID}/default",
    operationId: "setDefaultAddress",
    tag: "Orders",
    summary: "Make a saved address the default",
    description:
      "Checkout picks the default first. The previous default is unmarked; setting the current one again changes nothing.",
    auth: "account",
    request: { params: z.object({ addressID: Uuid }) },
    success: {
      status: 200,
      description: "Default address updated",
      schema: schemas.AddressResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_ADDRESS_ID)",
      404: "No such address of yours (ADDRESS_NOT_FOUND)",
    },
  });
}
