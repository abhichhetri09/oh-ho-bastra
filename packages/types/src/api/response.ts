import { z } from "zod";
import { ErrorCodeSchema } from "./error-codes";
import { ValidationCodeSchema } from "./validation-codes";

export const ValidationErrorSchema = z
  .object({
    code: ValidationCodeSchema,
    field: z.string().optional(),
    message: z.string(),
  })
  .meta({
    id: "ValidationError",
    description:
      "One invalid field; `field` is a react-hook-form style path such as `images.1`.",
  });
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const ApiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    code: ErrorCodeSchema,
    errors: z.array(ValidationErrorSchema).optional(),
  })
  .meta({
    id: "ApiError",
    description:
      "Every non-2xx response. `errors` is only present for VALIDATION_FAILED.",
  });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationMetaSchema = z
  .object({
    total: z.int().nonnegative(),
    total_pages: z.int().nonnegative(),
    page: z.int().positive(),
    limit: z.int().positive(),
    offset: z.int().nonnegative(),
  })
  .meta({ id: "PaginationMeta" });
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const MessageResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .meta({ id: "MessageResponse", description: "A 2xx response without data." });
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/** A 2xx response carrying `data`. */
export const successResponse = <T extends z.ZodType>(data: T) =>
  MessageResponseSchema.extend({ data });

/** A 2xx page of items with pagination `meta`. */
export const paginatedResponse = <T extends z.ZodType>(item: T) =>
  MessageResponseSchema.extend({
    data: z.array(item),
    meta: PaginationMetaSchema,
  });

/** Shared scalars, matching how the Go API serializes them. */
export const Uuid = z.uuid();
export const Timestamp = z.iso.datetime({ offset: true });
/** An amount of money in integer minor units (cents). */
export const Cents = z.int().nonnegative();
