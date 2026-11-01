import { z } from "zod";
import {
  Cents,
  paginatedResponse,
  successResponse,
  Timestamp,
  Uuid,
} from "../api/response";
import { ReferralRuleSchema } from "../settings/settings";

// The referral programme at work (apps/api/src/referrals): a customer's
// code, the friends it brought, and the store credit they earn. The rule
// itself is ReferralRule, in the store's settings.

/** What a referral code looks like once normalised: 8 letters and digits. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{8}$/;

/** A code as typed or linked (" ab12cd34 ") as it is stored. */
export const normalizeReferralCode = (code: string) =>
  code.trim().toUpperCase();

/** Why a referral code can't be used on a bag (a subset of the error codes). */
export const ReferralIssueCodeSchema = z
  .enum([
    "REFERRAL_NOT_FOUND",
    "REFERRAL_OWN_CODE",
    "REFERRAL_NOT_FIRST_ORDER",
    "REFERRAL_MIN_SUBTOTAL",
  ])
  .meta({
    id: "ReferralIssueCode",
    description:
      "REFERRAL_NOT_FOUND also covers the programme being switched off",
  });
export type ReferralIssueCode = z.infer<typeof ReferralIssueCodeSchema>;

export const CartReferralSchema = z
  .object({
    code: z.string(),
    discount: Cents.describe(
      "What the friend's discount takes off this bag; 0 with an issue",
    ),
    applied: z
      .boolean()
      .describe(
        "Whether it is the bag's discount: one discount per order, so a code that takes off more wins",
      ),
    issue: z
      .object({ code: ReferralIssueCodeSchema, message: z.string() })
      .nullable()
      .describe(
        "Why it doesn't apply (it stays on the bag; checkout goes ahead without it)",
      ),
  })
  .meta({
    id: "CartReferral",
    description: "A friend's referral code on the bag.",
  });
export type CartReferral = z.infer<typeof CartReferralSchema>;

export const ApplyReferralBodySchema = z
  .object({ code: z.string().trim().min(1).max(64) })
  .meta({
    id: "ApplyReferralBody",
    description: "Any case; spaces around it are ignored.",
  });
export type ApplyReferralBody = z.infer<typeof ApplyReferralBodySchema>;

export const ReferralOfferSchema = z
  .object({
    code: z.string(),
    friend_kind: ReferralRuleSchema.shape.friend_kind,
    friend_value: ReferralRuleSchema.shape.friend_value,
    friend_min: ReferralRuleSchema.shape.friend_min,
  })
  .meta({
    id: "ReferralOffer",
    description:
      "What a shared link offers a friend, for the storefront's welcome. Whether it applies to them is checked on their bag.",
  });
export type ReferralOffer = z.infer<typeof ReferralOfferSchema>;

export const ReferralOfferResponseSchema = successResponse(
  ReferralOfferSchema,
).meta({ id: "ReferralOfferResponse" });

export const ReferralStatusSchema = z
  .enum(["pending", "earned", "capped", "cancelled"])
  .meta({
    id: "ReferralStatus",
    description:
      "pending: waiting for the order to arrive and the wait to pass; earned: the credit is paid; capped: past the monthly cap, no credit; cancelled: the order was cancelled or refunded first",
  });
export type ReferralStatus = z.infer<typeof ReferralStatusSchema>;

export const MyReferralSchema = z
  .object({
    id: Uuid,
    friend: z
      .string()
      .describe('The friend\'s email, masked: "a***@example.com"'),
    status: ReferralStatusSchema,
    reward: Cents,
    created_at: Timestamp,
    payout_at: Timestamp.nullable().describe(
      "When the credit is (or was) due; null until the order arrives",
    ),
  })
  .meta({ id: "MyReferral" });
export type MyReferral = z.infer<typeof MyReferralSchema>;

export const MyReferralsSchema = z
  .object({
    code: z.string(),
    rule: ReferralRuleSchema,
    referrals: z.array(MyReferralSchema).describe("Newest first, at most 100"),
    balance: Cents.describe("The customer's store credit now"),
  })
  .meta({
    id: "MyReferrals",
    description:
      "The customer's code, the friends it brought and their credit.",
  });
export type MyReferrals = z.infer<typeof MyReferralsSchema>;

export const MyReferralsResponseSchema = successResponse(
  MyReferralsSchema,
).meta({ id: "MyReferralsResponse" });
export type MyReferralsResponse = z.infer<typeof MyReferralsResponseSchema>;

// Store credit

export const CreditKindSchema = z
  .enum(["earned", "spent", "expired", "adjusted", "reversed"])
  .meta({ id: "CreditKind" });
export type CreditKind = z.infer<typeof CreditKindSchema>;

export const CreditEntrySchema = z
  .object({
    id: Uuid,
    amount: z.int().describe("Cents: added above 0, taken below"),
    kind: CreditKindSchema,
    order_id: Uuid.nullable(),
    referral_id: Uuid.nullable(),
    expires_at: Timestamp.nullable().describe(
      "When credit added lapses; null never",
    ),
    note: z.string(),
    created_at: Timestamp,
  })
  .meta({ id: "CreditEntry", description: "One change to store credit." });
export type CreditEntry = z.infer<typeof CreditEntrySchema>;

export const MyCreditSchema = z
  .object({
    balance: Cents.describe("What's there to spend"),
    available: Cents.describe("The balance less what unpaid checkouts hold"),
    max_percent: z
      .int()
      .min(1)
      .max(100)
      .describe("The most of an order's total credit can pay"),
  })
  .meta({ id: "MyCredit" });
export type MyCredit = z.infer<typeof MyCreditSchema>;

export const MyCreditResponseSchema = successResponse(MyCreditSchema).meta({
  id: "MyCreditResponse",
});
export type MyCreditResponse = z.infer<typeof MyCreditResponseSchema>;

// Admin

export const AdminReferralSchema = z
  .object({
    id: Uuid,
    status: ReferralStatusSchema,
    reward: Cents,
    discount: Cents.describe("What the friend's order got off"),
    friend_email: z.string(),
    created_at: Timestamp,
    settled_at: Timestamp.nullable(),
    payout_at: Timestamp.nullable(),
    referrer_id: Uuid,
    referrer_name: z.string(),
    referrer_email: z.string(),
    order_number: z.int().positive(),
    order_status: z.string(),
  })
  .meta({ id: "AdminReferral" });
export type AdminReferral = z.infer<typeof AdminReferralSchema>;

export const AdminReferralListResponseSchema = paginatedResponse(
  AdminReferralSchema,
).meta({ id: "AdminReferralListResponse" });
export type AdminReferralListResponse = z.infer<
  typeof AdminReferralListResponseSchema
>;

export const CreditCustomerSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    balance: Cents,
  })
  .meta({ id: "CreditCustomer" });
export type CreditCustomer = z.infer<typeof CreditCustomerSchema>;

export const CreditCustomerListResponseSchema = successResponse(
  z.array(CreditCustomerSchema),
).meta({ id: "CreditCustomerListResponse" });

export const CreditAccountSchema = CreditCustomerSchema.extend({
  available: Cents.describe("The balance less what unpaid checkouts hold"),
  max_percent: z.int().min(1).max(100),
  entries: z.array(CreditEntrySchema).describe("Newest first"),
}).meta({ id: "CreditAccount" });
export type CreditAccount = z.infer<typeof CreditAccountSchema>;

export const CreditAccountResponseSchema = successResponse(
  CreditAccountSchema,
).meta({ id: "CreditAccountResponse" });
export type CreditAccountResponse = z.infer<typeof CreditAccountResponseSchema>;

/** The most an adjustment or a counter bill can be: €100,000. */
export const MAX_CREDIT_AMOUNT = 10_000_000;

export const CreditAdjustBodySchema = z
  .object({
    amount: z
      .int()
      .refine((n) => n !== 0, "Enter an amount to add or take off")
      .refine(
        (n) => Math.abs(n) <= MAX_CREDIT_AMOUNT,
        "Keep the amount to €100,000 or less",
      )
      .describe("Cents: above 0 adds credit, below 0 takes it off"),
    note: z
      .string()
      .trim()
      .min(1, "Say why, for the record")
      .max(300, "Keep the note to 300 characters"),
  })
  .meta({
    id: "CreditAdjustBody",
    description: "Adds or takes off credit by hand, with the reason.",
  });
export type CreditAdjustBody = z.infer<typeof CreditAdjustBodySchema>;

export const CreditRedeemBodySchema = z
  .object({
    bill: z
      .int()
      .min(1, "Enter the bill's total")
      .max(MAX_CREDIT_AMOUNT, "Keep the bill to €100,000 or less")
      .describe("The in-store bill's total, in cents"),
    amount: z
      .int()
      .min(1, "Enter the credit to use")
      .max(MAX_CREDIT_AMOUNT, "Keep the amount to €100,000 or less")
      .describe("The credit to take off it, in cents"),
  })
  .meta({
    id: "CreditRedeemBody",
    description:
      "Asks to pay part of an in-store bill with credit: the customer is emailed a code to confirm it.",
  });
export type CreditRedeemBody = z.infer<typeof CreditRedeemBodySchema>;

export const CreditRedemptionSchema = z
  .object({
    id: Uuid,
    amount: Cents,
    bill: Cents,
    expires_at: Timestamp.describe("The emailed code works until then"),
  })
  .meta({ id: "CreditRedemption" });
export type CreditRedemption = z.infer<typeof CreditRedemptionSchema>;

export const CreditRedemptionResponseSchema = successResponse(
  CreditRedemptionSchema,
).meta({ id: "CreditRedemptionResponse" });

export const CreditConfirmBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code from the customer's email"),
  })
  .meta({ id: "CreditConfirmBody" });
export type CreditConfirmBody = z.infer<typeof CreditConfirmBodySchema>;
