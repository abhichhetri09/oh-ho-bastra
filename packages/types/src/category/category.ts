import { z } from "zod";
import {
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";

export const CategorySchema = z
  .object({
    id: Uuid,
    name: z.string(),
    slug: z.string(),
    parent_id: Uuid.nullable().describe("null for a root category"),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Category" });
export type Category = z.infer<typeof CategorySchema>;

// Mirrors apps/api/internal/types/category.go. Category names are unique.
export const CategoryBodySchema = z
  .object({
    name: z.string().trim().min(2).max(20),
    parent_id: Uuid.optional().describe(
      "Makes it a subcategory; omit for a root category (an update moves it).",
    ),
  })
  .meta({
    id: "CategoryBody",
    description: "Create or update a category. Names are unique.",
  });
export type CategoryBody = z.infer<typeof CategoryBodySchema>;

export const CategoryResponseSchema = successResponse(CategorySchema).meta({
  id: "CategoryResponse",
});
export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;

export const CategoryListResponseSchema = paginatedResponse(
  CategorySchema,
).meta({ id: "CategoryListResponse" });
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

export const CategoryNodeSchema = CategorySchema.extend({
  depth: z.int().nonnegative().describe("0 for a root category"),
}).meta({
  id: "CategoryNode",
  description: "A category with its depth in the category tree.",
});
export type CategoryNode = z.infer<typeof CategoryNodeSchema>;

export const CategoryTreeResponseSchema = successResponse(
  z.array(CategoryNodeSchema).describe("Parents before children"),
).meta({ id: "CategoryTreeResponse" });
export type CategoryTreeResponse = z.infer<typeof CategoryTreeResponseSchema>;
