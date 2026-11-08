import { z } from "zod";
import { successResponse, Uuid } from "../api/response";
import { OptionTypeSchema } from "../product/product";

// Attributes: the store's option lists (Size, Colour…). The admin picks a
// variant's options from them; a variant keeps its own copy, so editing a
// list never changes variants already made.

const Hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, { message: "Use a colour like #1f2a44" });

export const AttributeValueSchema = z
  .object({
    id: Uuid,
    value: z.string(),
    hex: Hex.nullable().describe("A colour's swatch; null for text"),
  })
  .meta({ id: "AttributeValue" });
export type AttributeValue = z.infer<typeof AttributeValueSchema>;

export const AttributeSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    type: OptionTypeSchema,
    values: z.array(AttributeValueSchema).describe("In the admin's order"),
  })
  .meta({ id: "Attribute", description: "An option list, like Size." });
export type Attribute = z.infer<typeof AttributeSchema>;

export const AttributeBodySchema = z
  .object({
    name: z.string().trim().min(2).max(20),
    type: OptionTypeSchema,
    values: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(20),
          hex: Hex.nullable().optional(),
        }),
      )
      .max(100)
      .refine(
        (vs) =>
          new Set(vs.map((v) => v.value.toLowerCase())).size === vs.length,
        {
          message: "Values must not repeat",
          params: { code: "DUPLICATE_ITEM" },
        },
      )
      .describe("The whole list, in order (it replaces the old one)"),
  })
  .meta({
    id: "AttributeBody",
    description:
      "The name (unique, ignoring case), type and every value in order.",
  });
export type AttributeBody = z.infer<typeof AttributeBodySchema>;

export const AttributeListResponseSchema = successResponse(
  z.array(AttributeSchema),
).meta({ id: "AttributeListResponse" });
export type AttributeListResponse = z.infer<typeof AttributeListResponseSchema>;

export const AttributeResponseSchema = successResponse(AttributeSchema).meta({
  id: "AttributeResponse",
});
