import { z } from "zod";
import { Uuid } from "@repo/types";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Variants";
const base = "/api/v1/admin/products/{productID}/variants";
const variantParams = z.object({ productID: Uuid, variantID: Uuid });
const invalidIds =
  "Invalid product or variant id (INVALID_PRODUCT_ID, INVALID_VARIANT_ID)";
const notFound = "No such variant on this product (VARIANT_NOT_FOUND)";

export function registerVariantPaths() {
  operation({
    method: "post",
    path: base,
    operationId: "adminCreateVariant",
    tag,
    summary: "Create a variant",
    description:
      "Creates the variant with a generated SKU and links its option values (`properties`), creating missing options.",
    auth: "admin",
    request: {
      params: z.object({ productID: Uuid }),
      ...body(schemas.CreateVariantBodySchema),
    },
    success: {
      status: 201,
      description: "Variant created",
      schema: schemas.VariantResponseSchema,
    },
    errors: {
      400: "Invalid id or body (INVALID_PRODUCT_ID, VALIDATION_FAILED)",
      404: "Product not found (PRODUCT_NOT_FOUND)",
      409: "Same option combination, or a second default variant (VARIANT_ALREADY_EXISTS, DEFAULT_VARIANT_EXISTS)",
    },
  });

  operation({
    method: "get",
    path: `${base}/{variantID}`,
    operationId: "adminGetVariant",
    tag,
    summary: "Get a variant",
    auth: "admin",
    request: { params: variantParams },
    success: {
      status: 200,
      description: "Variant fetched",
      schema: schemas.VariantResponseSchema,
    },
    errors: { 400: invalidIds, 404: notFound },
  });

  operation({
    method: "put",
    path: `${base}/{variantID}`,
    operationId: "adminUpdateVariant",
    tag,
    summary: "Update a variant",
    description:
      "Replaces stock, images, prices and flags. The SKU and option combination never change.",
    auth: "admin",
    request: {
      params: variantParams,
      ...body(schemas.UpdateVariantBodySchema),
    },
    success: {
      status: 200,
      description: "Variant updated",
      schema: schemas.VariantResponseSchema,
    },
    errors: {
      400: `${invalidIds}, or invalid body (VALIDATION_FAILED)`,
      404: notFound,
      409: "The product already has a default variant (DEFAULT_VARIANT_EXISTS)",
    },
  });

  operation({
    method: "put",
    path: `${base}/{variantID}/stock`,
    operationId: "adminSetVariantStock",
    tag,
    summary: "Set a variant's stock",
    description:
      "Sets the counted stock (an absolute value, so retrying is harmless).",
    auth: "admin",
    request: { params: variantParams, ...body(schemas.SetStockBodySchema) },
    success: {
      status: 200,
      description: "Stock updated",
      schema: schemas.VariantResponseSchema,
    },
    errors: {
      400: `${invalidIds}, or invalid body (VALIDATION_FAILED)`,
      404: notFound,
    },
  });

  operation({
    method: "delete",
    path: `${base}/{variantID}`,
    operationId: "adminDeleteVariant",
    tag,
    summary: "Delete a variant",
    auth: "admin",
    request: { params: variantParams },
    success: {
      status: 200,
      description: "Variant deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: { 400: invalidIds, 404: notFound },
  });
}
