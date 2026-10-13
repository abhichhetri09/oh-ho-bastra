import { z } from "zod";

/**
 * Codes of the per-field items in a VALIDATION_FAILED response's `errors`.
 * Must list exactly the Go constants in
 * apps/api/internal/constants/validation_codes.go.
 */
export const ValidationCodeSchema = z
  .enum([
    "REQUIRED_FIELD",
    "BLANK_FIELD",
    "TOO_SHORT",
    "TOO_LONG",
    "OUT_OF_RANGE",
    "INVALID_EMAIL",
    "INVALID_UUID",
    "INVALID_URL",
    "INVALID_FORMAT",
    "INVALID_VALUE",
    "INVALID_TYPE",
    "INVALID_DATE",
    "DUPLICATE_ITEM",
    "LENGTH_MISMATCH",
    "VALIDATION_ERROR",
    "INVALID_REQUEST",
  ])
  .meta({
    id: "ValidationCode",
    description: "Why one field failed validation.",
  });

export type ValidationCode = z.infer<typeof ValidationCodeSchema>;
