import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, listingErrors, listingQuery, operation } from "./shared.ts";

const tag = "Products";
const productParam = z.object({ productID: Uuid });
const pageQuery = z.object({
  page: z
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .openapi({ description: "1-based page number (default 1)" }),
});

export function registerProductPaths() {
  operation({
    method: "get",
    path: "/api/v1/products",
    operationId: "listProducts",
    tag,
    summary: "List products",
    description:
      "Visible products (active, with an active default variant), 24 per page, priced by their default variant. Also returns the filter options and price range of all visible (or featured) products.",
    request: { query: listingQuery },
    success: {
      status: 200,
      description: "Products fetched",
      schema: schemas.ProductListingResponseSchema,
    },
    errors: listingErrors,
  });

  operation({
    method: "get",
    path: "/api/v1/products/{productSlug}",
    operationId: "getProductBySlug",
    tag,
    summary: "Get a product page",
    description:
      "The product with its default variant, its active variants and related products.",
    request: { params: z.object({ productSlug: z.string() }) },
    success: {
      status: 200,
      description: "Product fetched",
      schema: schemas.ProductPageResponseSchema,
    },
    errors: { 404: "No visible product with this slug (PRODUCT_NOT_FOUND)" },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/products",
    operationId: "adminListProducts",
    tag,
    summary: "List all products",
    description:
      "Every product, active or not, 20 per page, newest first unless sorted (sort and dir), optionally filtered.",
    auth: "admin",
    request: {
      query: pageQuery.extend({
        q: z
          .string()
          .max(100)
          .optional()
          .openapi({ description: "Name contains (case-insensitive)" }),
        status: z.enum(["active", "inactive"]).optional(),
        category: z.string().optional().openapi({
          description: "Category slug; includes its subcategories",
        }),
        sort: schemas.ProductSortSchema.optional(),
        dir: schemas.SortDirSchema.optional().openapi({
          description: "Defaults to the field's natural direction",
        }),
      }),
    },
    success: {
      status: 200,
      description: "Products fetched",
      schema: schemas.AdminProductListResponseSchema,
    },
    errors: {
      400: "Invalid or out-of-range page, or invalid filter (INVALID_PAGE_PARAMETER, INVALID_QUERY_PARAMETER)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/products/{productID}/variants",
    operationId: "adminListVariants",
    tag,
    summary: "A product's variants",
    description: "Every variant, inactive ones too, with its options.",
    auth: "admin",
    request: { params: z.object({ productID: Uuid }) },
    success: {
      status: 200,
      description: "Variants fetched",
      schema: schemas.AdminVariantListResponseSchema,
    },
    errors: {
      400: "Invalid product id (INVALID_PRODUCT_ID)",
      404: "No such product (PRODUCT_NOT_FOUND)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/admin/products",
    operationId: "adminCreateProduct",
    tag,
    summary: "Create a product",
    description:
      "The slug comes from the name, with a random suffix when it is taken.",
    auth: "admin",
    request: body(schemas.ProductBodySchema),
    success: {
      status: 201,
      description: "Product created",
      schema: schemas.ProductResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "Category not found (CATEGORY_NOT_FOUND)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/admin/products/{productID}",
    operationId: "adminGetProduct",
    tag,
    summary: "Get a product",
    auth: "admin",
    request: { params: productParam },
    success: {
      status: 200,
      description: "Product fetched",
      schema: schemas.ProductResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_PRODUCT_ID)",
      404: "Product not found (PRODUCT_NOT_FOUND)",
    },
  });

  operation({
    method: "put",
    path: "/api/v1/admin/products/{productID}",
    operationId: "adminUpdateProduct",
    tag,
    summary: "Update a product",
    description:
      "Replaces every field. The slug only changes when the name does.",
    auth: "admin",
    request: { params: productParam, ...body(schemas.ProductBodySchema) },
    success: {
      status: 200,
      description: "Product updated",
      schema: schemas.ProductResponseSchema,
    },
    errors: {
      400: "Invalid id or body (INVALID_PRODUCT_ID, VALIDATION_FAILED)",
      404: "Product or category not found (PRODUCT_NOT_FOUND, CATEGORY_NOT_FOUND)",
    },
  });

  operation({
    method: "delete",
    path: "/api/v1/admin/products/{productID}",
    operationId: "adminDeleteProduct",
    tag,
    summary: "Delete a product",
    description: "Also deletes its variants, options and cart items.",
    auth: "admin",
    request: { params: productParam },
    success: {
      status: 200,
      description: "Product deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid id (INVALID_PRODUCT_ID)",
      404: "Product not found (PRODUCT_NOT_FOUND)",
    },
  });
}
