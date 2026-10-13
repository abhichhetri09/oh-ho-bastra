import { z } from "zod";
import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Reviews";
const path = "/api/v1/products/{productSlug}/reviews";
const params = z.object({ productSlug: z.string() });
const noProduct = "No such product on sale (PRODUCT_NOT_FOUND)";

export function registerReviewPaths() {
  operation({
    method: "get",
    path,
    operationId: "listReviews",
    tag,
    summary: "A product's reviews",
    description:
      "Published reviews, newest first, 10 per page, with a summary (average, count, per-star counts).",
    request: {
      params,
      query: z.object({ page: z.int().min(1).max(100_000).optional() }),
    },
    success: {
      status: 200,
      description: "Reviews fetched",
      schema: schemas.ReviewListResponseSchema,
    },
    errors: { 400: "Invalid page (INVALID_PAGE_PARAMETER)", 404: noProduct },
  });

  operation({
    method: "get",
    path: `${path}/mine`,
    operationId: "getMyReview",
    tag,
    summary: "My review of a product",
    description:
      "Whether I may review it (I bought it) and my review, hidden or not.",
    auth: "user",
    request: { params },
    success: {
      status: 200,
      description: "Review fetched",
      schema: schemas.MyReviewResponseSchema,
    },
    errors: { 404: noProduct },
  });

  operation({
    method: "put",
    path,
    operationId: "writeReview",
    tag,
    summary: "Write or edit my review",
    description:
      "One review per buyer and product; writing again edits it. A review an admin hid stays hidden.",
    auth: "user",
    request: { params, ...body(schemas.ReviewBodySchema) },
    success: {
      status: 200,
      description: "Review saved",
      schema: schemas.ReviewResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      403: "No paid order of yours holds this product (NOT_VERIFIED_BUYER)",
      404: noProduct,
    },
  });

  operation({
    method: "delete",
    path,
    operationId: "deleteReview",
    tag,
    summary: "Delete my review",
    auth: "user",
    request: { params },
    success: {
      status: 200,
      description: "Review deleted",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      404: "No such product, or no review of yours (PRODUCT_NOT_FOUND, REVIEW_NOT_FOUND)",
    },
  });
}
