CREATE TYPE "order_status" AS ENUM('pending_payment', 'paid', 'cancelled', 'fulfilled');--> statement-breakpoint
CREATE TYPE "payment_status" AS ENUM('pending', 'paid', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY,
	"number" serial UNIQUE,
	"user_id" text,
	"status" "order_status" DEFAULT 'pending_payment'::"order_status" NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"street" text NOT NULL,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"country" text DEFAULT 'FI' NOT NULL,
	"shipping_method" text NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" serial PRIMARY KEY,
	"order_id" text NOT NULL,
	"variant_id" integer,
	"product_slug" text NOT NULL,
	"product_name" text NOT NULL,
	"size" text NOT NULL,
	"sku" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"swatch" jsonb NOT NULL,
	CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"method" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending'::"payment_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"reference" text NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "order_user_idx" ON "order" ("user_id");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" ("order_id");--> statement-breakpoint
CREATE INDEX "payment_order_idx" ON "payment" ("order_id");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variant_id_product_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE;