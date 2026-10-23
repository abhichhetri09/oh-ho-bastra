import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

export function registerAdminPaths() {
  operation({
    method: "get",
    path: "/api/v1/admin/stats",
    operationId: "adminGetStats",
    tag: "Admin",
    summary: "Dashboard figures",
    description:
      "For a range of days ending today (UTC): sales (paid, shipped and delivered orders, by payment date) and sign-ups against the period before, sales by day and best sellers. Also orders by status, what needs attention, low stock, and the latest orders and reviews.",
    auth: "admin",
    request: {
      query: z.object({
        range: schemas.StatsRangeSchema.optional().describe("30d by default"),
      }),
    },
    success: {
      status: 200,
      description: "Stats fetched",
      schema: schemas.AdminStatsResponseSchema,
    },
    errors: { 400: "Unknown range (INVALID_QUERY_PARAMETER)" },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/uploads/signature",
    operationId: "adminSignUpload",
    tag: "Admin",
    summary: "Sign an image upload",
    description:
      "A signature for one direct browser upload to Cloudinary (folder ohhobastra/products), valid for an hour.",
    auth: "admin",
    success: {
      status: 200,
      description: "Upload signed",
      schema: schemas.UploadSignatureResponseSchema,
    },
  });

  const page = z.int().min(1).max(100_000).optional();
  const orderFilters = {
    status: schemas.OrderStatusSchema.optional(),
    q: z.string().max(100).optional(),
    customer: Uuid.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sort: schemas.OrderSortSchema.optional(),
    dir: schemas.SortDirSchema.optional(),
  };
  const number = z.object({ number: z.int().positive() });
  const orderErrors = {
    400: "Invalid order number (INVALID_ORDER_NUMBER)",
    404: "No order with that number (ORDER_NOT_FOUND)",
  };

  operation({
    method: "get",
    path: "/api/v1/admin/orders",
    operationId: "adminListOrders",
    tag: "Admin",
    summary: "All orders",
    description:
      "Newest first unless sorted, 20 per page. q is an order number (1042, OHB-1042 or #1042) or a piece of the customer's email; customer is a user ID; from and to are placed dates (UTC, both included).",
    auth: "admin",
    request: { query: z.object({ page, ...orderFilters }) },
    success: {
      status: 200,
      description: "Orders fetched",
      schema: schemas.AdminOrderListResponseSchema,
    },
    errors: {
      400: "Invalid page or filter (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/counts",
    operationId: "adminGetCounts",
    tag: "Admin",
    summary: "What's waiting",
    description:
      "Orders by status, paid orders short of stock, failed emails and sold-out variants: the nav badges and order tabs.",
    auth: "admin",
    success: {
      status: 200,
      description: "Counts fetched",
      schema: schemas.AdminCountsResponseSchema,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/inventory",
    operationId: "adminListInventory",
    tag: "Admin",
    summary: "Stock by variant",
    description:
      "One row per variant on sale (hidden=true adds hidden variants and products), lowest stock first, 25 per page, with the count at each stock level. q is a piece of the product name or SKU; category includes its subcategories.",
    auth: "admin",
    request: {
      query: z.object({
        page,
        q: z.string().max(100).optional(),
        category: z.string().optional().describe("A category slug"),
        stock: schemas.StockLevelSchema.optional(),
        hidden: z.boolean().optional(),
      }),
    },
    success: {
      status: 200,
      description: "Inventory fetched",
      schema: schemas.AdminInventoryResponseSchema,
    },
    errors: {
      400: "Invalid page or filter (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/emails",
    operationId: "adminListEmails",
    tag: "Admin",
    summary: "The email outbox",
    description:
      "Order emails, newest first, 25 per page, with the count of each status.",
    auth: "admin",
    request: {
      query: z.object({ page, status: schemas.EmailStatusSchema.optional() }),
    },
    success: {
      status: 200,
      description: "Emails fetched",
      schema: schemas.AdminEmailListResponseSchema,
    },
    errors: {
      400: "Invalid page or status (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/emails/{emailID}/retry",
    operationId: "adminRetryEmail",
    tag: "Admin",
    summary: "Send a failed email again",
    description:
      "Puts it back in the queue with a fresh set of attempts; the sender takes it within seconds.",
    auth: "admin",
    request: { params: z.object({ emailID: Uuid }) },
    success: {
      status: 200,
      description: "Email queued again",
      schema: schemas.AdminEmailResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_EMAIL_ID)",
      404: "No such email (EMAIL_NOT_FOUND)",
      409: "It hasn't failed (EMAIL_NOT_FAILED)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/search",
    operationId: "adminSearch",
    tag: "Admin",
    summary: "Search orders, products and customers",
    description:
      "For the command palette: orders by number or a piece of the email, products by name or SKU (hidden ones too), customers by name or email; up to 5 of each.",
    auth: "admin",
    request: { query: z.object({ q: z.string().min(1).max(100) }) },
    success: {
      status: 200,
      description: "Search done",
      schema: schemas.AdminSearchResponseSchema,
    },
    errors: { 400: "q missing or too long (INVALID_QUERY_PARAMETER)" },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/customers",
    operationId: "adminListCustomers",
    tag: "Admin",
    summary: "Customer accounts",
    description:
      "Newest first, 20 per page, with each one's placed orders, spend (paid, shipped and delivered) and last order. q is a piece of the name or email.",
    auth: "admin",
    request: {
      query: z.object({
        page,
        q: z.string().max(100).optional(),
        sort: schemas.CustomerSortSchema.optional(),
        dir: schemas.SortDirSchema.optional(),
      }),
    },
    success: {
      status: 200,
      description: "Customers fetched",
      schema: schemas.AdminCustomerListResponseSchema,
    },
    errors: {
      400: "Invalid page or search (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/customers/{userID}",
    operationId: "adminGetCustomer",
    tag: "Admin",
    summary: "A customer",
    description:
      "Their totals, saved addresses and latest reviews. Admin accounts aren't customers.",
    auth: "admin",
    request: { params: z.object({ userID: Uuid }) },
    success: {
      status: 200,
      description: "Customer fetched",
      schema: schemas.AdminCustomerResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_USER_ID)",
      404: "No customer with that id (CUSTOMER_NOT_FOUND)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/orders/export.csv",
    operationId: "adminExportOrders",
    tag: "Admin",
    summary: "Orders as CSV",
    description:
      "The orders list's filters and order, every match up to 10,000 rows, amounts in major units. Text a spreadsheet would run as a formula starts with an apostrophe.",
    auth: "admin",
    request: { query: z.object(orderFilters) },
    success: {
      status: 200,
      description: "A CSV file (attachment)",
      schema: z.string(),
      contentType: "text/csv",
    },
    errors: { 400: "Invalid filter (INVALID_QUERY_PARAMETER)" },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/orders/{number}",
    operationId: "adminGetOrder",
    tag: "Admin",
    summary: "One order",
    description: "With its items, customer and payment.",
    auth: "admin",
    request: { params: number },
    success: {
      status: 200,
      description: "Order fetched",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: orderErrors,
  });

  const transition =
    "Not allowed in the order's status (INVALID_ORDER_TRANSITION)";

  operation({
    method: "post",
    path: "/api/v1/admin/orders/{number}/ship",
    operationId: "adminShipOrder",
    tag: "Admin",
    summary: "Mark an order shipped",
    description:
      "A paid order becomes shipped, with its tracking number if given.",
    auth: "admin",
    request: { params: number, ...body(schemas.ShipOrderBodySchema) },
    success: {
      status: 200,
      description: "Order shipped",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: {
      400: "Invalid order number or body (INVALID_ORDER_NUMBER, VALIDATION_FAILED)",
      404: orderErrors[404],
      409: transition,
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/orders/{number}/tracking",
    operationId: "adminSetOrderTracking",
    tag: "Admin",
    summary: "Set an order's tracking number",
    description:
      "Adds, changes or (with an empty string) removes the tracking number of a shipped or delivered order. The customer sees it on their order page.",
    auth: "admin",
    request: { params: number, ...body(schemas.OrderTrackingBodySchema) },
    success: {
      status: 200,
      description: "Tracking number updated",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: {
      400: "Invalid order number or body (INVALID_ORDER_NUMBER, VALIDATION_FAILED)",
      404: orderErrors[404],
      409: "The order isn't shipped or delivered (INVALID_ORDER_TRANSITION)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/orders/{number}/deliver",
    operationId: "adminDeliverOrder",
    tag: "Admin",
    summary: "Mark an order delivered",
    description: "A shipped order becomes delivered.",
    auth: "admin",
    request: { params: number },
    success: {
      status: 200,
      description: "Order delivered",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: { ...orderErrors, 409: transition },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/orders/{number}/cancel",
    operationId: "adminCancelOrder",
    tag: "Admin",
    summary: "Cancel an unpaid order",
    description:
      "A pending order is cancelled and its stock returned. Its Stripe page is expired first; if it was paid meanwhile, the order is settled as paid and the answer is 409 ORDER_ALREADY_PAID.",
    auth: "admin",
    request: { params: number },
    success: {
      status: 200,
      description: "Order cancelled",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: {
      ...orderErrors,
      409: "Not pending, still opening its checkout or settling a payment, or just paid (INVALID_ORDER_TRANSITION, ORDER_ALREADY_PAID)",
      502: "Stripe didn't answer; nothing changed (PAYMENT_PROVIDER_ERROR)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/orders/{number}/refund",
    operationId: "adminRefundOrder",
    tag: "Admin",
    summary: "Refund an order",
    description:
      "A paid, shipped or delivered order is refunded in full through Stripe (once: the refund is keyed by the order) and becomes refunded.",
    auth: "admin",
    request: { params: number, ...body(schemas.RefundOrderBodySchema) },
    success: {
      status: 200,
      description: "Order refunded",
      schema: schemas.AdminOrderDetailResponseSchema,
    },
    errors: {
      400: "Invalid order number or body (INVALID_ORDER_NUMBER, VALIDATION_FAILED)",
      404: orderErrors[404],
      409: "Not refundable in its status, no payment recorded, or Stripe declined it (INVALID_ORDER_TRANSITION, REFUND_REFUSED)",
      502: "Stripe didn't answer; nothing changed (PAYMENT_PROVIDER_ERROR)",
      503: "Payments aren't set up (PAYMENTS_UNAVAILABLE)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/reviews",
    operationId: "adminListReviews",
    tag: "Admin",
    summary: "All reviews",
    description: "Newest first, 20 per page, for moderation.",
    auth: "admin",
    request: {
      query: z.object({
        page,
        status: schemas.ReviewStatusSchema.optional(),
        rating: z.int().min(1).max(5).optional(),
      }),
    },
    success: {
      status: 200,
      description: "Reviews fetched",
      schema: schemas.AdminReviewListResponseSchema,
    },
    errors: {
      400: "Invalid page or filter (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/reviews/{id}/status",
    operationId: "adminSetReviewStatus",
    tag: "Admin",
    summary: "Publish or hide a review",
    description: "The product's rating counts published reviews only.",
    auth: "admin",
    request: {
      params: z.object({ id: z.uuid() }),
      ...body(schemas.ReviewStatusBodySchema),
    },
    success: {
      status: 200,
      description: "Review updated",
      schema: schemas.AdminReviewResponseSchema,
    },
    errors: {
      400: "Invalid id or body (INVALID_REVIEW_ID, VALIDATION_FAILED)",
      404: "No such review (REVIEW_NOT_FOUND)",
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/settings",
    operationId: "adminSetStoreTheme",
    tag: "Admin",
    summary: "Change the store's theme",
    description: "The storefront switches to the theme on its next render.",
    auth: "admin",
    request: body(schemas.StoreThemeBodySchema),
    success: {
      status: 200,
      description: "Store theme updated",
      schema: schemas.StoreSettingsResponseSchema,
    },
    errors: { 400: "Unknown theme (VALIDATION_FAILED)" },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/settings/announcements",
    operationId: "adminSetAnnouncements",
    tag: "Admin",
    summary: "Change the top banner",
    description:
      "Turns the storefront's scrolling banner on or off and replaces its messages, in order. Off (or no messages) hides it; the messages are kept.",
    auth: "admin",
    request: body(schemas.AnnouncementsBodySchema),
    success: {
      status: 200,
      description: "Announcements updated",
      schema: schemas.StoreSettingsResponseSchema,
    },
    errors: {
      400: "Too many messages, or an empty or too long one (VALIDATION_FAILED)",
    },
  });
}
