import { z } from "zod";
import {
  Cents,
  PaginationMetaSchema,
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";

export const ProductSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    slug: z.string(),
    category_id: Uuid.nullable().describe("null once its category is deleted"),
    description: z.string().nullable(),
    features: z.array(z.string()),
    images: z.array(z.url()),
    image_public_ids: z.array(z.string()),
    is_active: z.boolean(),
    is_featured: z.boolean(),
    created_at: Timestamp,
    updated_at: Timestamp,
    rating_count: z.int().nonnegative().describe("Published reviews"),
    rating_avg: z
      .number()
      .min(0)
      .max(5)
      .describe("Their average, to one decimal; 0 without reviews"),
  })
  .meta({ id: "Product" });
export type Product = z.infer<typeof ProductSchema>;

// Storefront prices: offer_price is the active offer only (set, and either
// open-ended or not yet expired); price is what the customer pays.
const storefrontPrice = {
  selling_price: Cents,
  offer_price: Cents.nullable().describe("The active offer, or null"),
  price: Cents.describe(
    "What the customer pays: the active offer, else the selling price",
  ),
};

export const ProductWithPriceSchema = ProductSchema.extend({
  variant_id: Uuid.describe("The default variant"),
  ...storefrontPrice,
  in_stock: z
    .boolean()
    .describe("Whether any active variant has stock (false: sold out)"),
}).meta({
  id: "ProductWithPrice",
  description: "A product priced by its default variant (storefront listings).",
});
export type ProductWithPrice = z.infer<typeof ProductWithPriceSchema>;

export const AdminProductSchema = ProductSchema.extend({
  category_name: z.string().nullable(),
  default_price: Cents.nullable().describe(
    "The default variant's selling price; null without one",
  ),
  total_stock: z.int().nonnegative().describe("Across all variants"),
  variant_count: z.int().nonnegative(),
}).meta({
  id: "AdminProduct",
  description: "A row of the admin products table.",
});
export type AdminProduct = z.infer<typeof AdminProductSchema>;

export const ProductDetailSchema = ProductWithPriceSchema.extend({
  stock: z.int().nonnegative(),
  variant_images: z.array(z.url()),
}).meta({
  id: "ProductDetail",
  description: "A product with its default variant's stock, images and price.",
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const OptionTypeSchema = z
  .enum(["text", "color"])
  .meta({ id: "OptionType", description: "color options render as swatches" });
export type OptionType = z.infer<typeof OptionTypeSchema>;

export const VariantOptionSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    type: OptionTypeSchema,
  })
  .meta({ id: "VariantOption" });
export type VariantOption = z.infer<typeof VariantOptionSchema>;

export const FilterOptionSchema = z
  .object({
    option_name: z.string(),
    option_value: z.string(),
    option_type: OptionTypeSchema,
  })
  .meta({ id: "FilterOption" });
export type FilterOption = z.infer<typeof FilterOptionSchema>;

export const PriceRangeSchema = z
  .object({
    min_price: Cents.describe("0 when nothing is in scope"),
    max_price: Cents,
  })
  .meta({ id: "PriceRange" });
export type PriceRange = z.infer<typeof PriceRangeSchema>;

// Mirrors apps/api/internal/types/product.go. Update replaces every field.
export const ProductBodySchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    images: z.array(z.url()).min(1).max(5),
    image_public_ids: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(5)
      .describe("Cloudinary public IDs, one per image, in the same order"),
    description: z.string().trim().min(1).max(5000),
    features: z.array(z.string().trim().min(1).max(100)).max(7).optional(),
    category_id: Uuid,
    is_active: z.boolean(),
    is_featured: z.boolean(),
  })
  .refine((b) => b.image_public_ids.length === b.images.length, {
    path: ["image_public_ids"],
    message: "Provide one public ID per image",
  })
  .meta({
    id: "ProductBody",
    description: "Create or fully replace a product.",
  });
export type ProductBody = z.infer<typeof ProductBodySchema>;

export const SortOptionSchema = z
  .enum(["relevance", "newest", "price_asc", "price_desc"])
  .meta({
    id: "SortOption",
    description:
      "`relevance` ranks search matches; without a search it means `newest`.",
  });
export type SortOption = z.infer<typeof SortOptionSchema>;

export const ProductResponseSchema = successResponse(ProductSchema).meta({
  id: "ProductResponse",
});
export type ProductResponse = z.infer<typeof ProductResponseSchema>;

export const AdminProductListResponseSchema = paginatedResponse(
  AdminProductSchema,
).meta({ id: "AdminProductListResponse" });
export type AdminProductListResponse = z.infer<
  typeof AdminProductListResponseSchema
>;

export const ProductListingSchema = z
  .object({
    products: z.array(ProductWithPriceSchema),
    filter_options: z
      .array(FilterOptionSchema)
      .describe(
        "Every option value in scope, ignoring the price and option filters",
      ),
    price_range: PriceRangeSchema.describe(
      "Of everything in scope, ignoring the price and option filters",
    ),
  })
  .meta({
    id: "ProductListing",
    description:
      "A page of storefront products with the filter options and price range of their scope.",
  });
export type ProductListing = z.infer<typeof ProductListingSchema>;

export const ProductListingResponseSchema = successResponse(
  ProductListingSchema,
)
  .extend({ meta: PaginationMetaSchema })
  .meta({ id: "ProductListingResponse" });
export type ProductListingResponse = z.infer<
  typeof ProductListingResponseSchema
>;
