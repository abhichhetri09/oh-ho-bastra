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
      "Reserves the cart's stock in a pending order (replacing the user's unpaid checkouts) and opens a Stripe Checkout page for 31 minutes. Send the shopper to `checkout_url`; Stripe returns them to /checkout/success or /cart. The cart is emptied of the bought lines once payment lands.",
    auth: "user",
    request: body(schemas.CheckoutBodySchema),
    success: {
      status: 201,
      description: "Checkout started",
      schema: schemas.CheckoutResponseSchema,
    },
    errors: {
      400: "Invalid body, or not exactly one of address_id and address (VALIDATION_FAILED)",
      404: "No such saved address (ADDRESS_NOT_FOUND)",
      409: "The cart is empty, or a line is off sale or short (CART_EMPTY, CART_HAS_ISSUES)",
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
    method: "get",
    path: "/api/v1/addresses",
    operationId: "listAddresses",
    tag: "Orders",
    summary: "My saved addresses",
    description:
      "Saved at checkout with save_address; at most 10. The default comes first, then the newest.",
    auth: "user",
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
    auth: "user",
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
    auth: "user",
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
