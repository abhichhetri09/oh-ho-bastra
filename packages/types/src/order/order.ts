import { z } from "zod";
import {
  Cents,
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";
import { VariantOptionSchema } from "../product/product";

/** Countries checkout ships to (ISO 3166-1 alpha-2). */
export const SHIPPING_COUNTRIES = [
  "FI",
  "US",
  "CA",
  "GB",
  "IE",
  "DE",
  "FR",
  "NL",
  "AU",
  "NZ",
  "NP",
  "IN",
  "JP",
] as const;
export const CountrySchema = z.enum(SHIPPING_COUNTRIES).meta({
  id: "Country",
  description: "A country checkout ships to (ISO 3166-1 alpha-2)",
});
export type Country = z.infer<typeof CountrySchema>;

// Mirrors AddressInput in apps/api/internal/types/checkout.go.
export const AddressInputSchema = z
  .object({
    full_name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(20),
    line1: z.string().trim().min(1).max(120),
    line2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1).max(80),
    region: z.string().trim().max(80).optional(),
    postal_code: z.string().trim().min(1).max(12),
    country: CountrySchema,
  })
  .meta({ id: "AddressInput" });
export type AddressInput = z.infer<typeof AddressInputSchema>;

/** The most addresses a customer can save (apps/api checkout.MaxAddresses). */
export const MAX_ADDRESSES = 10;

export const AddressSchema = z
  .object({
    id: Uuid,
    user_id: Uuid,
    full_name: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    region: z.string().nullable(),
    postal_code: z.string(),
    country: CountrySchema,
    is_default: z
      .boolean()
      .describe("Checkout picks it first; at most one per customer"),
    created_at: Timestamp,
  })
  .meta({ id: "Address", description: "A saved shipping address." });
export type Address = z.infer<typeof AddressSchema>;

export const AddressListResponseSchema = successResponse(
  z.array(AddressSchema).describe("The default first, then newest; at most 10"),
).meta({ id: "AddressListResponse" });

export const AddressResponseSchema = successResponse(AddressSchema).meta({
  id: "AddressResponse",
});

export const CheckoutBodySchema = z
  .object({
    address_id: Uuid.optional().describe("A saved address"),
    address: AddressInputSchema.optional().describe("Or a new one"),
    save_address: z
      .boolean()
      .optional()
      .describe("Add the new address to the address book"),
    make_default: z
      .boolean()
      .optional()
      .describe("With save_address: make the new address the default"),
  })
  .meta({
    id: "CheckoutBody",
    description:
      "Ship to a saved address or a new one: exactly one of the two.",
  });
export type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

export const CheckoutSchema = z
  .object({
    order_number: z.int().positive(),
    checkout_url: z
      .url()
      .describe("The Stripe Checkout page to send the shopper to"),
  })
  .meta({ id: "Checkout" });

export const CheckoutResponseSchema = successResponse(CheckoutSchema).meta({
  id: "CheckoutResponse",
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const OrderStatusSchema = z
  .enum(["pending", "paid", "shipped", "delivered", "cancelled", "refunded"])
  .meta({ id: "OrderStatus" });
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** The address as it was when the order was placed. */
export const AddressSnapshotSchema = z
  .object({
    full_name: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string(),
    city: z.string(),
    region: z.string(),
    postal_code: z.string(),
    country: z.string(),
  })
  .meta({ id: "AddressSnapshot" });

export const OrderSchema = z
  .object({
    id: Uuid,
    number: z.int().positive(),
    user_id: Uuid,
    status: OrderStatusSchema,
    subtotal: Cents,
    shipping: Cents,
    total: Cents,
    currency: z.string(),
    email: z.string(),
    shipping_address: AddressSnapshotSchema,
    stripe_session_id: z.string().nullable(),
    expires_at: Timestamp.describe(
      "A pending order holds its stock until then",
    ),
    paid_at: Timestamp.nullable(),
    cancelled_at: Timestamp.nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
    shipped_at: Timestamp.nullable(),
    delivered_at: Timestamp.nullable(),
    refunded_at: Timestamp.nullable(),
    tracking_number: z
      .string()
      .nullable()
      .describe("The carrier's, when the order shipped with one"),
  })
  .meta({ id: "Order" });
export type Order = z.infer<typeof OrderSchema>;

export const OrderItemSchema = z
  .object({
    id: Uuid,
    order_id: Uuid,
    variant_id: Uuid.nullable().describe("null once the variant is deleted"),
    product_id: Uuid.nullable().describe("null once the product is deleted"),
    product_name: z.string(),
    product_slug: z.string(),
    sku: z.string().nullable(),
    options: z.array(VariantOptionSchema),
    image: z.string(),
    unit_price: Cents,
    quantity: z.int().positive(),
    line_total: Cents,
  })
  .meta({ id: "OrderItem", description: "What was bought, as it was then." });
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderDetailSchema = OrderSchema.extend({
  items: z.array(OrderItemSchema),
  reviewed_product_ids: z
    .array(Uuid)
    .describe("Products of this order you've reviewed"),
}).meta({ id: "OrderDetail" });
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const OrderDetailResponseSchema = successResponse(
  OrderDetailSchema,
).meta({ id: "OrderDetailResponse" });
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;

export const OrderSummarySchema = z
  .object({
    id: Uuid,
    number: z.int().positive(),
    status: OrderStatusSchema,
    total: Cents,
    currency: z.string(),
    created_at: Timestamp,
    paid_at: Timestamp.nullable(),
    item_count: z.int().nonnegative(),
    preview_images: z.array(z.string()).describe("Up to 3, priciest first"),
  })
  .meta({ id: "OrderSummary" });
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const OrderListResponseSchema = paginatedResponse(
  OrderSummarySchema,
).meta({ id: "OrderListResponse" });
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
