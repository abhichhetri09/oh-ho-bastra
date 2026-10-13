import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, listingErrors, listingQuery, operation } from "./shared.ts";

const tag = "Categories";
const idParam = z.object({ id: Uuid });
const pageQuery = z.object({
  page: z
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .openapi({ description: "1-based page number (default 1)" }),
});

export function registerCategoryPaths() {
  operation({
    method: "get",
    path: "/api/v1/admin/categories",
    operationId: "adminListCategories",
    tag,
    summary: "List categories",
    description: "20 per page, newest first.",
    auth: "admin",
    request: { query: pageQuery },
    success: {
      status: 200,
      description: "Categories fetched",
      schema: schemas.CategoryListResponseSchema,
    },
    errors: { 400: "Invalid or out-of-range page (INVALID_PAGE_PARAMETER)" },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/categories",
    operationId: "adminCreateCategory",
    tag,
    summary: "Create a category",
    description: "With `parent_id` it creates a subcategory.",
    auth: "admin",
    request: body(schemas.CategoryBodySchema),
    success: {
      status: 201,
      description: "Category or subcategory created",
      schema: schemas.CategoryResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "Parent not found (CATEGORY_NOT_FOUND)",
      409: "Name already taken (CATEGORY_ALREADY_EXISTS)",
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/categories/{id}",
    operationId: "adminUpdateCategory",
    tag,
    summary: "Update a category",
    description:
      "Renames the category and optionally moves it under another parent. Omitting `parent_id` keeps the current parent.",
    auth: "admin",
    request: { params: idParam, ...body(schemas.CategoryBodySchema) },
    success: {
      status: 200,
      description: "Category updated",
      schema: schemas.CategoryResponseSchema,
    },
    errors: {
      400: "Invalid id or body, or the move would create a cycle (INVALID_CATEGORY_ID, VALIDATION_FAILED, SELF_REFERENCING_CATEGORY, CYCLIC_CATEGORY_REFERENCE)",
      404: "Category or parent not found (CATEGORY_NOT_FOUND)",
      409: "Name already taken (CATEGORY_ALREADY_EXISTS)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/admin/categories/{id}",
    operationId: "adminDeleteCategory",
    tag,
    summary: "Delete a category",
    description:
      "Its subcategories become roots and its products lose their category.",
    auth: "admin",
    request: { params: idParam },
    success: {
      status: 200,
      description: "Category deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_CATEGORY_ID)",
      404: "Category not found (CATEGORY_NOT_FOUND)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/categories",
    operationId: "listCategories",
    tag,
    summary: "List all categories",
    description:
      "Every category with its depth, parents before children, for building the navigation tree. Not paginated.",
    success: {
      status: 200,
      description: "Categories fetched",
      schema: schemas.CategoryTreeResponseSchema,
    },
  });

  operation({
    method: "get",
    path: "/api/v1/categories/{slug}",
    operationId: "listCategoryProducts",
    tag,
    summary: "List a category's products",
    description:
      "Visible products of this category and all its subcategories, 24 per page, priced by their default variant. Also returns the category's filter options and price range.",
    request: {
      params: z.object({ slug: z.string() }),
      query: listingQuery,
    },
    success: {
      status: 200,
      description: "Products fetched",
      schema: schemas.ProductListingResponseSchema,
    },
    errors: {
      ...listingErrors,
      404: "Category not found (CATEGORY_NOT_FOUND)",
    },
  });
}
