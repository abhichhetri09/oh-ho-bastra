import { z } from "zod";
import { Cents, successResponse, Timestamp, Uuid } from "../api/response";
import { VariantOptionSchema } from "../product/product";

// Blanks: plain garments kept in stock and printed to order. Every variant
// linked to a blank shares its stock, so selling one print of a Black / M
// tee takes a unit from all the prints on Black / M.

export const BlankSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    stock: z.int().nonnegative(),
    garment: z
      .string()
      .nullable()
      .describe("The garment it is one colour and size of, if any"),
    options: z
      .array(VariantOptionSchema)
      .describe("Its option values (Colour, Size), given to its variants"),
    price: Cents.nullable().describe("The usual price of a print on it"),
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
    price: z
      .int()
      .positive()
      .max(100_000_000)
      .nullable()
      .optional()
      .describe("The usual price of a print on it, in cents; null for none"),
  })
  .meta({
    id: "BlankBody",
    description:
      "The blank's name (unique, ignoring case), its counted stock (an absolute value), which every variant on it takes, and its usual price.",
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

/** Every combination of the option lists, in order (the first varies slowest). */
export function combinations<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((combo) => list.map((v) => [...combo, v])),
    [[]],
  );
}

const GarmentOptionSchema = z.object({
  name: z.string().trim().min(2).max(20),
  type: z.enum(["text", "color"]),
  values: z
    .array(z.string().trim().min(1).max(20))
    .min(1)
    .max(30)
    .refine((v) => new Set(v).size === v.length, {
      message: "Values must not repeat",
      params: { code: "DUPLICATE_ITEM" },
    }),
});

export const GarmentBodySchema = z
  .object({
    garment: z.string().trim().min(1).max(60),
    options: z
      .array(GarmentOptionSchema)
      .min(1)
      .max(3)
      .refine((o) => new Set(o.map((x) => x.name)).size === o.length, {
        message: "Options must not repeat",
        params: { code: "DUPLICATE_ITEM" },
      }),
    price: z.int().positive().max(100_000_000).describe("In cents"),
    stock: z
      .int()
      .min(0)
      .max(10_000)
      .describe("The count each new blank starts with"),
  })
  .refine((b) => b.options.reduce((n, o) => n * o.values.length, 1) <= 200, {
    path: ["options"],
    message: "At most 200 colour and size combinations",
    params: { code: "OUT_OF_RANGE" },
  })
  .meta({
    id: "GarmentBody",
    description:
      'A garment and its options: one blank is made per combination, named "Garment, Black, M". A blank of that name already joins the garment and keeps its stock.',
  });
export type GarmentBody = z.infer<typeof GarmentBodySchema>;

export const GarmentSchema = z
  .object({
    garment: z.string(),
    blank_count: z.int().nonnegative(),
  })
  .meta({ id: "Garment" });
export type Garment = z.infer<typeof GarmentSchema>;

export const GarmentListResponseSchema = successResponse(
  z.array(GarmentSchema).describe("By name"),
).meta({ id: "GarmentListResponse" });
export type GarmentListResponse = z.infer<typeof GarmentListResponseSchema>;

export const GarmentResponseSchema = successResponse(
  z.array(BlankSchema).describe("The garment's blanks"),
).meta({ id: "GarmentResponse" });
export type GarmentResponse = z.infer<typeof GarmentResponseSchema>;
