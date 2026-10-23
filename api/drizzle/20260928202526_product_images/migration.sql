CREATE TABLE "product_image" (
	"id" serial PRIMARY KEY,
	"product_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "image_url" text;--> statement-breakpoint
CREATE INDEX "product_image_product_idx" ON "product_image" ("product_id","sort_order");--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_id_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE;