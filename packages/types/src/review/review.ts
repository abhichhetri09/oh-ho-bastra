import { z } from "zod";
import {
  PaginationMetaSchema,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";

// Mirrors ReviewRequest in apps/api/internal/types/review.go.
export const ReviewBodySchema = z
  .object({
    rating: z.int().min(1).max(5),
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(2000),
  })
  .meta({ id: "ReviewBody" });
export type ReviewBody = z.infer<typeof ReviewBodySchema>;

export const ReviewSchema = z
  .object({
    id: Uuid,
    product_id: Uuid,
    user_id: Uuid,
    rating: z.int().min(1).max(5),
    title: z.string(),
    body: z.string(),
    status: z
      .enum(["published", "hidden"])
      .describe("hidden: taken down by an admin"),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "Review", description: "A review as its author sees it." });
export type Review = z.infer<typeof ReviewSchema>;

export const PublicReviewSchema = z
  .object({
    id: Uuid,
    rating: z.int().min(1).max(5),
    title: z.string(),
    body: z.string(),
    author: z.string().describe('First name and last initial: "Ada L."'),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({ id: "PublicReview" });
export type PublicReview = z.infer<typeof PublicReviewSchema>;

export const ReviewSummarySchema = z
  .object({
    average: z.number().min(0).max(5),
    count: z.int().nonnegative(),
    distribution: z
      .array(z.int().nonnegative())
      .length(5)
      .describe("Reviews per star: [1★, 2★, 3★, 4★, 5★]"),
  })
  .meta({ id: "ReviewSummary" });
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const ReviewListResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      summary: ReviewSummarySchema,
      reviews: z.array(PublicReviewSchema).describe("Newest first"),
    }),
    meta: PaginationMetaSchema,
  })
  .meta({ id: "ReviewListResponse" });
export type ReviewListResponse = z.infer<typeof ReviewListResponseSchema>;

export const MyReviewResponseSchema = successResponse(
  z.object({
    can_review: z
      .boolean()
      .describe("A paid order of the user's holds the product"),
    review: ReviewSchema.nullable(),
  }),
).meta({ id: "MyReviewResponse" });
export type MyReviewResponse = z.infer<typeof MyReviewResponseSchema>;

export const ReviewResponseSchema = successResponse(ReviewSchema).meta({
  id: "ReviewResponse",
});
