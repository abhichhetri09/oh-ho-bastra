CREATE TABLE "collection" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"blurb" text NOT NULL,
	"swatch" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"collection_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"color" text NOT NULL,
	"fabric" text NOT NULL,
	"fit" text NOT NULL,
	"weight" text NOT NULL,
	"care" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"swatch" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_price_positive" CHECK ("price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" serial PRIMARY KEY,
	"product_id" integer NOT NULL,
	"size" text NOT NULL,
	"sku" text NOT NULL UNIQUE,
	"stock" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_variant_stock_nonnegative" CHECK ("stock" >= 0)
);
--> statement-breakpoint
DROP TABLE IF EXISTS "users";--> statement-breakpoint
CREATE INDEX "product_collection_idx" ON "product" ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_product_size_idx" ON "product_variant" ("product_id","size");--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_collection_id_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE;