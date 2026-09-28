ALTER TABLE "collection" ALTER COLUMN "swatch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item" ALTER COLUMN "swatch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "swatch" DROP NOT NULL;