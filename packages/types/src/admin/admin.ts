import { z } from "zod";
import {
  Cents,
  MessageResponseSchema,
  PaginationMetaSchema,
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";
import {
  AddressSchema,
  OrderItemSchema,
  OrderSchema,
  OrderStatusSchema,
} from "../order/order";
import { VariantOptionSchema } from "../product/product";

export const ReviewStatusSchema = z
  .enum(["published", "hidden"])
  .meta({ id: "ReviewStatus" });
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const StatsRangeSchema = z
  .enum(["7d", "30d", "90d"])
  .meta({ id: "StatsRange", description: "Days ending today (UTC)" });
export type StatsRange = z.infer<typeof StatsRangeSchema>;

const PeriodTotalsSchema = z
  .object({
    revenue: Cents.describe("Paid, shipped and delivered orders"),
    orders: z.int().nonnegative(),
    average_order_value: Cents,
    new_customers: z.int().nonnegative(),
  })
  .meta({
    id: "PeriodTotals",
    description: "Sales by payment date, and sign-ups",
  });

export const AdminStatsSchema = z
  .object({
    range: StatsRangeSchema,
    current: PeriodTotalsSchema.describe("The range"),
    previous: PeriodTotalsSchema.describe("The same number of days before it"),
    customers: z.int().nonnegative().describe("Customer accounts, all time"),
    series: z
      .array(
        z.object({
          day: z.iso.date(),
          revenue: Cents,
          orders: z.int().nonnegative(),
        }),
      )
      .describe("Every day of the range (UTC), oldest first"),
    orders_by_status: z
      .object({
        pending: z.int().nonnegative(),
        paid: z.int().nonnegative(),
        shipped: z.int().nonnegative(),
        delivered: z.int().nonnegative(),
        cancelled: z.int().nonnegative(),
        refunded: z.int().nonnegative(),
      })
      .describe("Every order by status, all time"),
    top_products: z
      .array(
        z.object({
          product_id: Uuid,
          product_name: z.string(),
          image: z.string().describe("Empty when the product has none"),
          units: z.int().positive(),
          revenue: Cents,
        }),
      )
      .describe("Best sellers by revenue in the range (5 at most)"),
    needs_attention: z.object({
      to_ship: z.int().nonnegative().describe("Paid orders"),
      oversold: z
        .int()
        .nonnegative()
        .describe("Paid orders with an item short of stock"),
      failed_emails: z.int().nonnegative().describe("Emails given up on"),
      out_of_stock: z
        .int()
        .nonnegative()
        .describe("Active variants with none left"),
    }),
    low_stock: z
      .array(
        z.object({
          product_id: Uuid,
          product_name: z.string(),
          variant_id: Uuid,
          sku: z.string().nullable(),
          stock: z.int().nonnegative(),
        }),
      )
      .describe(
        "Active variants with 5 or fewer left, lowest first (10 at most)",
      ),
    recent_orders: z.array(
      z.object({
        id: Uuid,
        number: z.int().positive(),
        status: OrderStatusSchema,
        total: Cents,
        currency: z.string(),
        email: z.string(),
        created_at: Timestamp,
        paid_at: Timestamp.nullable(),
      }),
    ),
    recent_reviews: z
      .array(
        z.object({
          id: Uuid,
          rating: z.int().min(1).max(5),
          title: z.string(),
          status: ReviewStatusSchema,
          created_at: Timestamp,
          product_id: Uuid,
          product_name: z.string(),
          author_name: z.string(),
        }),
      )
      .describe("The 5 latest, hidden ones too"),
  })
  .meta({ id: "AdminStats" });
export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminStatsResponseSchema = successResponse(AdminStatsSchema).meta({
  id: "AdminStatsResponse",
});

export const UploadSignatureSchema = z
  .object({
    cloud_name: z.string(),
    api_key: z.string(),
    allowed_formats: z
      .string()
      .describe("Comma-separated; Cloudinary rejects any other format"),
    folder: z.string(),
    timestamp: z
      .int()
      .describe("Unix seconds; Cloudinary accepts it for an hour"),
    signature: z.string(),
  })
  .meta({
    id: "UploadSignature",
    description:
      "POST the file with these fields (all of them, unchanged) to https://api.cloudinary.com/v1_1/{cloud_name}/image/upload.",
  });
export type UploadSignature = z.infer<typeof UploadSignatureSchema>;

export const UploadSignatureResponseSchema = successResponse(
  UploadSignatureSchema,
).meta({ id: "UploadSignatureResponse" });

export const AdminOrderRowSchema = z
  .object({
    id: Uuid,
    number: z.int().positive(),
    status: OrderStatusSchema,
    total: Cents,
    currency: z.string(),
    email: z.string(),
    customer_name: z.string(),
    item_count: z.int().nonnegative(),
    created_at: Timestamp,
    paid_at: Timestamp.nullable(),
  })
  .meta({
    id: "AdminOrderRow",
    description: "A row of the admin orders table.",
  });
export type AdminOrderRow = z.infer<typeof AdminOrderRowSchema>;

export const AdminOrderListResponseSchema = paginatedResponse(
  AdminOrderRowSchema,
).meta({ id: "AdminOrderListResponse" });

export const PaymentSchema = z
  .object({
    id: Uuid,
    order_id: Uuid,
    stripe_session_id: z.string(),
    stripe_payment_intent_id: z.string().nullable(),
    amount: Cents,
    currency: z.string(),
    created_at: Timestamp,
    stripe_refund_id: z.string().nullable(),
    refunded_at: Timestamp.nullable(),
  })
  .meta({ id: "Payment", description: "The Stripe payment of an order." });
export type Payment = z.infer<typeof PaymentSchema>;

export const AdminOrderItemSchema = OrderItemSchema.extend({
  stock_shortfall: z
    .int()
    .nonnegative()
    .describe("How many weren't in stock when it was paid for"),
}).meta({ id: "AdminOrderItem" });

export const AdminOrderDetailSchema = OrderSchema.extend({
  items: z.array(AdminOrderItemSchema),
  customer: z.object({ id: Uuid, name: z.string(), email: z.string() }),
  payment: PaymentSchema.nullable().describe("null until the order is paid"),
}).meta({ id: "AdminOrderDetail" });
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;

export const AdminOrderDetailResponseSchema = successResponse(
  AdminOrderDetailSchema,
).meta({ id: "AdminOrderDetailResponse" });

// Mirror apps/api/internal/types/admin.go.
export const ShipOrderBodySchema = z
  .object({
    tracking_number: z.string().trim().max(64).optional(),
  })
  .meta({ id: "ShipOrderBody" });
export type ShipOrderBody = z.infer<typeof ShipOrderBodySchema>;

export const RefundOrderBodySchema = z
  .object({
    restock: z
      .boolean()
      .describe(
        "Return the items to stock: yes for an order that never shipped, or came back",
      ),
  })
  .meta({ id: "RefundOrderBody" });
export type RefundOrderBody = z.infer<typeof RefundOrderBodySchema>;

export const ReviewStatusBodySchema = z
  .object({ status: ReviewStatusSchema })
  .meta({ id: "ReviewStatusBody" });

export const AdminReviewSchema = z
  .object({
    id: Uuid,
    rating: z.int().min(1).max(5),
    title: z.string(),
    body: z.string(),
    status: ReviewStatusSchema,
    created_at: Timestamp,
    updated_at: Timestamp,
    product_id: Uuid,
    product_name: z.string(),
    product_slug: z.string(),
    author_name: z.string(),
    author_email: z.string(),
  })
  .meta({
    id: "AdminReview",
    description: "A review with its product and author.",
  });
export type AdminReview = z.infer<typeof AdminReviewSchema>;

export const AdminReviewListResponseSchema = paginatedResponse(
  AdminReviewSchema,
).meta({ id: "AdminReviewListResponse" });

export const AdminReviewResponseSchema = successResponse(
  AdminReviewSchema,
).meta({ id: "AdminReviewResponse" });

// Customers: "orders" are placed orders (not abandoned checkouts), "spend"
// is paid, shipped and delivered orders (refunds don't count).

export const AdminCustomerRowSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    created_at: Timestamp,
    orders: z.int().nonnegative(),
    spend: Cents,
    last_order_at: Timestamp.nullable().describe("null before the first"),
  })
  .meta({ id: "AdminCustomerRow" });
export type AdminCustomerRow = z.infer<typeof AdminCustomerRowSchema>;

export const AdminCustomerListResponseSchema = paginatedResponse(
  AdminCustomerRowSchema,
).meta({ id: "AdminCustomerListResponse" });

export const AdminCustomerSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    created_at: Timestamp,
    orders: z.int().nonnegative(),
    spend: Cents,
    paid_orders: z.int().nonnegative().describe("Paid, shipped or delivered"),
    average_order_value: Cents.describe("Spend per paid order"),
    first_order_at: Timestamp.nullable(),
    last_order_at: Timestamp.nullable(),
    addresses: z.array(AddressSchema),
    reviews: z
      .array(
        z.object({
          id: Uuid,
          rating: z.int().min(1).max(5),
          title: z.string(),
          body: z.string(),
          status: ReviewStatusSchema,
          created_at: Timestamp,
          product_id: Uuid,
          product_name: z.string(),
        }),
      )
      .describe("The 10 latest"),
  })
  .meta({
    id: "AdminCustomer",
    description: "Orders come from adminListOrders with customer=",
  });
export type AdminCustomer = z.infer<typeof AdminCustomerSchema>;

export const AdminCustomerResponseSchema = successResponse(
  AdminCustomerSchema,
).meta({ id: "AdminCustomerResponse" });

const OrderStatusCountsSchema = z
  .object({
    pending: z.int().nonnegative(),
    paid: z.int().nonnegative(),
    shipped: z.int().nonnegative(),
    delivered: z.int().nonnegative(),
    cancelled: z.int().nonnegative(),
    refunded: z.int().nonnegative(),
  })
  .meta({ id: "OrderStatusCounts", description: "Every order by status" });

export const AdminCountsSchema = z
  .object({
    orders_by_status: OrderStatusCountsSchema,
    to_ship: z.int().nonnegative().describe("Paid orders"),
    oversold: z
      .int()
      .nonnegative()
      .describe("Paid orders with an item short of stock"),
    failed_emails: z.int().nonnegative(),
    out_of_stock: z
      .int()
      .nonnegative()
      .describe("Active variants of active products with none left"),
  })
  .meta({ id: "AdminCounts", description: "What's waiting on the admin" });
export type AdminCounts = z.infer<typeof AdminCountsSchema>;

export const AdminCountsResponseSchema = successResponse(
  AdminCountsSchema,
).meta({ id: "AdminCountsResponse" });

export const StockLevelSchema = z
  .enum(["out", "low", "in"])
  .meta({ id: "StockLevel", description: "None, 1 to 5, or more than 5" });
export type StockLevel = z.infer<typeof StockLevelSchema>;

export const AdminInventoryRowSchema = z
  .object({
    variant_id: Uuid,
    product_id: Uuid,
    product_name: z.string(),
    sku: z.string().nullable(),
    stock: z.int().nonnegative(),
    selling_price: Cents,
    is_active: z.boolean(),
    product_active: z.boolean(),
    image: z.string().describe("The variant's first image, else the product's"),
    options: z.array(VariantOptionSchema),
  })
  .meta({ id: "AdminInventoryRow" });
export type AdminInventoryRow = z.infer<typeof AdminInventoryRowSchema>;

// A page of rows with counts beside them, so not paginatedResponse.
export const AdminInventoryResponseSchema = MessageResponseSchema.extend({
  meta: PaginationMetaSchema,
  data: z
    .object({
      rows: z.array(AdminInventoryRowSchema),
      counts: z
        .object({
          out_of_stock: z.int().nonnegative(),
          low: z.int().nonnegative(),
          in_stock: z.int().nonnegative(),
        })
        .describe("Per stock level, for the other filters"),
    })
    .meta({ id: "AdminInventory" }),
}).meta({ id: "AdminInventoryResponse" });
export type AdminInventoryResponse = z.infer<
  typeof AdminInventoryResponseSchema
>;

export const EmailStatusSchema = z
  .enum(["pending", "sent", "failed"])
  .meta({ id: "EmailStatus" });
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

export const AdminEmailSchema = z
  .object({
    id: Uuid,
    kind: z.enum(["order_confirmed", "order_shipped", "order_refunded"]),
    status: EmailStatusSchema,
    attempts: z.int().nonnegative(),
    last_error: z.string().nullable(),
    created_at: Timestamp,
    sent_at: Timestamp.nullable(),
    next_attempt_at: Timestamp.describe("When a pending one is tried next"),
    requeued_at: Timestamp.nullable().describe("When it was last sent again"),
    order_number: z.int().positive(),
    email: z.string().describe("The order's email, where it goes"),
  })
  .meta({ id: "AdminEmail" });
export type AdminEmail = z.infer<typeof AdminEmailSchema>;

// A page of rows with counts beside them, so not paginatedResponse.
export const AdminEmailListResponseSchema = MessageResponseSchema.extend({
  meta: PaginationMetaSchema,
  data: z
    .object({
      rows: z.array(AdminEmailSchema),
      counts: z.object({
        pending: z.int().nonnegative(),
        sent: z.int().nonnegative(),
        failed: z.int().nonnegative(),
      }),
    })
    .meta({ id: "AdminEmailList" }),
}).meta({ id: "AdminEmailListResponse" });

export const AdminEmailResponseSchema = successResponse(AdminEmailSchema).meta({
  id: "AdminEmailResponse",
});

/** Sort direction for the admin tables. */
export const SortDirSchema = z.enum(["asc", "desc"]).meta({ id: "SortDir" });
export type SortDir = z.infer<typeof SortDirSchema>;

export const OrderSortSchema = z
  .enum(["created", "total"])
  .meta({ id: "OrderSort", description: "created by default" });
export type OrderSort = z.infer<typeof OrderSortSchema>;

export const ProductSortSchema = z
  .enum(["created", "updated", "name", "price", "stock"])
  .meta({ id: "ProductSort", description: "created by default" });
export type ProductSort = z.infer<typeof ProductSortSchema>;

export const CustomerSortSchema = z
  .enum(["joined", "orders", "spend"])
  .meta({ id: "CustomerSort", description: "joined by default" });
export type CustomerSort = z.infer<typeof CustomerSortSchema>;

export const AdminSearchSchema = z
  .object({
    orders: z.array(AdminOrderRowSchema),
    products: z.array(
      z.object({
        id: Uuid,
        name: z.string(),
        is_active: z.boolean(),
        image: z.string(),
      }),
    ),
    customers: z.array(AdminCustomerRowSchema),
  })
  .meta({ id: "AdminSearch", description: "Up to 5 of each" });
export type AdminSearch = z.infer<typeof AdminSearchSchema>;

export const AdminSearchResponseSchema = successResponse(
  AdminSearchSchema,
).meta({ id: "AdminSearchResponse" });
