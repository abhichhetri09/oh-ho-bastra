import { z } from "zod";
import {
  Cents,
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";

// Discount codes (apps/api/src/coupons): a percentage or a fixed amount off
// the bag's subtotal after sale prices, one per bag.

/** What a code looks like once normalised: uppercased, trimmed. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** A code as typed ("  summer10 ") as it is stored ("SUMMER10"). */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

export const CouponKindSchema = z.enum(["percent", "fixed"]).meta({
  id: "CouponKind",
  description: "percent: value is 1–100 (%); fixed: value is cents off",
});
export type CouponKind = z.infer<typeof CouponKindSchema>;

/** Why a code can't be used (a subset of the error codes). */
export const CouponIssueCodeSchema = z
  .enum([
    "COUPON_NOT_FOUND",
    "COUPON_EXPIRED",
    "COUPON_MIN_SUBTOTAL",
    "COUPON_USED_UP",
    "COUPON_ALREADY_USED",
  ])
  .meta({
    id: "CouponIssueCode",
    description:
      "COUPON_NOT_FOUND also covers a code that is switched off or not started yet",
  });
export type CouponIssueCode = z.infer<typeof CouponIssueCodeSchema>;

export const CartCouponSchema = z
  .object({
    code: z.string(),
    kind: CouponKindSchema.nullable().describe(
      "null when the code is COUPON_NOT_FOUND",
    ),
    value: z
      .int()
      .positive()
      .nullable()
      .describe("null when the code is COUPON_NOT_FOUND"),
    discount: Cents.describe("What it takes off now; 0 with an issue"),
    issue: z
      .object({ code: CouponIssueCodeSchema, message: z.string() })
      .nullable()
      .describe(
        "Why the code doesn't apply right now (it stays on the bag; checkout refuses with this code until it is fixed or removed)",
      ),
  })
  .meta({ id: "CartCoupon", description: "The code applied to the bag." });
export type CartCoupon = z.infer<typeof CartCouponSchema>;

export const ApplyCouponBodySchema = z
  .object({ code: z.string().trim().min(1).max(64) })
  .meta({
    id: "ApplyCouponBody",
    description: "Any case; spaces around it are ignored.",
  });
export type ApplyCouponBody = z.infer<typeof ApplyCouponBodySchema>;

// Admin

/** The most a fixed code takes off, and the highest minimum: €10,000. */
export const MAX_COUPON_AMOUNT = 1_000_000;

export const CouponBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .regex(
        /^[A-Za-z0-9_-]{3,32}$/,
        "Use 3 to 32 letters, digits, hyphens or underscores",
      )
      .toUpperCase()
      .describe("Any case; stored uppercased, and unique"),
    kind: CouponKindSchema,
    value: z
      .int()
      .positive()
      .max(MAX_COUPON_AMOUNT)
      .describe("percent: 1–100; fixed: cents"),
    min_subtotal: Cents.max(MAX_COUPON_AMOUNT)
      .optional()
      .describe("The subtotal the bag needs, in cents; 0 or omitted for any"),
    starts_at: Timestamp.optional().describe("Omit to start at once"),
    ends_at: Timestamp.optional().describe("Omit to never end"),
    max_redemptions: z
      .int()
      .positive()
      .max(1_000_000)
      .optional()
      .describe("Uses across every customer; omit for no limit"),
    once_per_customer: z
      .boolean()
      .optional()
      .describe("One use per email address (default false)"),
    is_active: z.boolean().optional().describe("Default true"),
  })
  .superRefine((body, ctx) => {
    if (body.kind === "percent" && body.value > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A percentage can be at most 100",
        params: { code: "OUT_OF_RANGE" },
      });
    }
    if (
      body.starts_at &&
      body.ends_at &&
      Date.parse(body.ends_at) <= Date.parse(body.starts_at)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "The end must be after the start",
        params: { code: "OUT_OF_RANGE" },
      });
    }
  })
  .meta({
    id: "CouponBody",
    description:
      "Create or replace a coupon: an omitted optional field is cleared (or its default).",
  });
export type CouponBody = z.infer<typeof CouponBodySchema>;
/** The form's values, before the code is normalised. */
export type CouponBodyInput = z.input<typeof CouponBodySchema>;

export const CouponActiveBodySchema = z
  .object({ is_active: z.boolean() })
  .meta({ id: "CouponActiveBody" });
export type CouponActiveBody = z.infer<typeof CouponActiveBodySchema>;

export const AdminCouponSchema = z
  .object({
    id: Uuid,
    code: z.string(),
    kind: CouponKindSchema,
    value: z.int().positive(),
    min_subtotal: Cents,
    starts_at: Timestamp.nullable(),
    ends_at: Timestamp.nullable(),
    max_redemptions: z.int().positive().nullable(),
    once_per_customer: z.boolean(),
    is_active: z.boolean(),
    created_at: Timestamp,
    updated_at: Timestamp,
    redemptions: z
      .int()
      .nonnegative()
      .describe(
        "Orders that used it, unpaid checkouts included (a cancelled one gives its use back)",
      ),
  })
  .meta({ id: "AdminCoupon" });
export type AdminCoupon = z.infer<typeof AdminCouponSchema>;

export const AdminCouponListResponseSchema = paginatedResponse(
  AdminCouponSchema,
).meta({ id: "AdminCouponListResponse" });

export const AdminCouponResponseSchema = successResponse(
  AdminCouponSchema,
).meta({ id: "AdminCouponResponse" });
