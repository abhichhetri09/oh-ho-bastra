import { z } from "zod";
import { successResponse, Timestamp, Uuid } from "../api/response";

// Blanks: plain garments kept in stock and printed to order. Every variant
// linked to a blank shares its stock, so selling one print of a Black / M
// tee takes a unit from all the prints on Black / M.

export const BlankSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    stock: z.int().nonnegative(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .meta({
    id: "Blank",
    description:
      "A plain garment whose stock its variants share (printed to order).",
  });
export type Blank = z.infer<typeof BlankSchema>;

export const AdminBlankSchema = BlankSchema.extend({
  variant_count: z.int().nonnegative().describe("Variants drawing on it"),
}).meta({ id: "AdminBlank" });
export type AdminBlank = z.infer<typeof AdminBlankSchema>;

export const BlankBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    stock: z.int().min(0).max(10_000),
  })
  .meta({
    id: "BlankBody",
    description:
      "The blank's name (unique, ignoring case) and its counted stock (an absolute value), which every variant on it takes.",
  });
export type BlankBody = z.infer<typeof BlankBodySchema>;

export const BlankListResponseSchema = successResponse(
  z.array(AdminBlankSchema).describe("By name"),
).meta({ id: "BlankListResponse" });
export type BlankListResponse = z.infer<typeof BlankListResponseSchema>;

export const BlankResponseSchema = successResponse(BlankSchema).meta({
  id: "BlankResponse",
});
export type BlankResponse = z.infer<typeof BlankResponseSchema>;
