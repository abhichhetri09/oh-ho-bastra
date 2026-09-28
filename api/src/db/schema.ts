import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema.ts";

export type Swatch = {
  from: string;
  to: string;
  sheen: string;
  fold: string;
};

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const collection = pgTable("collection", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  blurb: text("blurb").notNull(),
  // Cloth gradient, now only a fallback when there's no cover photo.
  swatch: jsonb("swatch").$type<Swatch>(),
  // Cover photo for the collection card and banner.
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

export const product = pgTable(
  "product",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    color: text("color").notNull(),
    fabric: text("fabric").notNull(),
    fit: text("fit").notNull(),
    weight: text("weight").notNull(),
    care: text("care").notNull(),
    // Minor units (cents), VAT included.
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").default("EUR").notNull(),
    // Temporary cloth gradient until product images land; then optional accent.
    swatch: jsonb("swatch").$type<Swatch>(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("product_collection_idx").on(table.collectionId),
    check("product_price_positive", sql`${table.priceCents} > 0`),
  ],
);

export const productVariant = pgTable(
  "product_variant",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    sku: text("sku").notNull().unique(),
    stock: integer("stock").default(0).notNull(),
    // Per-size price override in cents; null means the product's base price.
    priceCents: integer("price_cents"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_variant_product_size_idx").on(
      table.productId,
      table.size,
    ),
    check("product_variant_stock_nonnegative", sql`${table.stock} >= 0`),
    check("product_variant_price_positive", sql`${table.priceCents} is null or ${table.priceCents} > 0`),
  ],
);

// Product photos, in display order; the first is the cover.
export const productImage = pgTable(
  "product_image",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("product_image_product_idx").on(table.productId, table.sortOrder)],
);

export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "cancelled",
  "fulfilled",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "paid",
  "cancelled",
  "failed",
]);

export const order = pgTable(
  "order",
  {
    // Unguessable: the order page URL doubles as the guest's receipt link.
    id: text("id").primaryKey(),
    number: serial("number").notNull().unique(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: orderStatus("status").default("pending_payment").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    street: text("street").notNull(),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    country: text("country").default("FI").notNull(),
    shippingMethod: text("shipping_method").notNull(),
    // All amounts in cents, VAT included; vatCents is the VAT share of totalCents.
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    vatCents: integer("vat_cents").notNull(),
    currency: text("currency").default("EUR").notNull(),
    paidAt: timestamp("paid_at"),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at"),
    ...timestamps,
  },
  (table) => [
    index("order_user_idx").on(table.userId),
    index("order_status_idx").on(table.status),
  ],
);

export const orderItem = pgTable(
  "order_item",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").references(() => productVariant.id, {
      onDelete: "set null",
    }),
    // Snapshot of the catalog at order time.
    productSlug: text("product_slug").notNull(),
    productName: text("product_name").notNull(),
    size: text("size").notNull(),
    sku: text("sku").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    swatch: jsonb("swatch").$type<Swatch>(),
    // Snapshot of the product's cover photo at order time.
    imageUrl: text("image_url"),
  },
  (table) => [
    index("order_item_order_idx").on(table.orderId),
    check("order_item_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    method: text("method").notNull(),
    status: paymentStatus("status").default("pending").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").default("EUR").notNull(),
    // Finnish bank reference number (viitenumero) shown on the receipt.
    reference: text("reference").notNull(),
    completedAt: timestamp("completed_at"),
    ...timestamps,
  },
  (table) => [index("payment_order_idx").on(table.orderId)],
);

export const orderEventType = pgEnum("order_event_type", [
  "created",
  "paid",
  "payment_failed",
  "payment_cancelled",
  "fulfilled",
  "cancelled",
  "note",
  "tracking_updated",
]);

// Append-only history of an order: status changes and internal notes.
export const orderEvent = pgTable(
  "order_event",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    type: orderEventType("type").notNull(),
    message: text("message"),
    // Null for system and customer-driven events.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("order_event_order_idx").on(table.orderId)],
);

// Store-wide settings as validated JSON blobs, one row per section.
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// One saved delivery address per account, used to prefill checkout.
export const savedAddress = pgTable("saved_address", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  street: text("street").notNull(),
  postalCode: text("postal_code").notNull(),
  city: text("city").notNull(),
  country: text("country").default("FI").notNull(),
  ...timestamps,
});
