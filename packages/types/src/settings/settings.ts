import { z } from "zod";
import { Cents, successResponse, Timestamp } from "../api/response";

/** The storefront themes (apps/web/lib/themes.ts holds their look). */
export const StoreThemeSchema = z
  .enum(["editorial", "studio", "botanical", "blaze"])
  .meta({ id: "StoreTheme" });
export type StoreTheme = z.infer<typeof StoreThemeSchema>;

/**
 * Headline faces a store can use instead of its theme's own
 * (apps/web/lib/themes.ts holds their look).
 */
export const StoreHeadingFontSchema = z
  .enum([
    "instrument-serif",
    "fraunces",
    "geist",
    "space-grotesk",
    "playfair",
    "archivo",
  ])
  .meta({ id: "StoreHeadingFont" });
export type StoreHeadingFont = z.infer<typeof StoreHeadingFontSchema>;

/** Corner styles a store can use instead of its theme's own. */
export const StoreCornersSchema = z
  .enum(["sharp", "soft", "round"])
  .meta({ id: "StoreCorners" });
export type StoreCorners = z.infer<typeof StoreCornersSchema>;

/** Limits of the scrolling top banner. */
export const MAX_ANNOUNCEMENTS = 6;
export const MAX_ANNOUNCEMENT_LENGTH = 80;

/** Limits of the business details (the store_settings CHECKs match). */
export const BUSINESS_LIMITS = {
  business_name: 120,
  business_id: 40,
  business_address: 300,
  business_email: 254,
  business_phone: 40,
} as const;

/**
 * The most the admin can set delivery to, and the highest free-delivery
 * threshold, in cents (€1,000 and €100,000).
 */
export const SHIPPING_LIMITS = {
  flat: 100_000,
  free_from: 10_000_000,
  free_items: 100,
} as const;

export const ShippingRuleSchema = z
  .object({
    flat: Cents.describe(
      "What an order below free_from pays for delivery, in cents.",
    ),
    free_from: z
      .int()
      .positive()
      .nullable()
      .describe(
        "Orders from this subtotal, in cents and counted after any discount code, ship free; null: no amount rule.",
      ),
    free_items: z
      .int()
      .positive()
      .nullable()
      .describe(
        "Orders of this many items or more ship free too (either rule is enough); null: no item rule.",
      ),
  })
  .meta({
    id: "ShippingRule",
    description:
      "What delivery costs. Checkout charges it as it is then, and each order keeps what it was charged.",
  });
export type ShippingRule = z.infer<typeof ShippingRuleSchema>;

/**
 * The most the admin can set the referral programme to: amounts in cents
 * (€1,000), a friend's percent off, and days, referrals a month and months.
 */
export const REFERRAL_LIMITS = {
  amount: 100_000,
  percent: 50,
  pay_after_days: 365,
  monthly_cap: 100,
  expiry_months: 60,
} as const;

/** How a referred friend's discount counts: cents off, or a percent. */
export const ReferralFriendKindSchema = z
  .enum(["amount", "percent"])
  .meta({ id: "ReferralFriendKind" });
export type ReferralFriendKind = z.infer<typeof ReferralFriendKindSchema>;

export const ReferralRuleSchema = z
  .object({
    enabled: z
      .boolean()
      .describe("Whether the programme runs; off keeps its rule."),
    friend_kind: ReferralFriendKindSchema.describe(
      "Whether friend_value is cents off or a percent off.",
    ),
    friend_value: z
      .int()
      .positive()
      .describe(
        "What a referred friend's first order gets off: cents, or a percent (1 to 50).",
      ),
    friend_min: z
      .int()
      .positive()
      .nullable()
      .describe(
        "The subtotal, in cents, the friend's order needs for the discount; null: no minimum.",
      ),
    reward: Cents.describe(
      "The store credit, in cents, the referrer earns for each friend.",
    ),
    pay_after_days: z
      .int()
      .min(0)
      .describe(
        "Days after the friend's order before the referrer's credit is paid (returns settle first).",
      ),
    custom_prints: z
      .boolean()
      .describe("Whether the friend's discount also applies to custom prints."),
    monthly_cap: z
      .int()
      .positive()
      .nullable()
      .describe(
        "The most referrals a referrer is rewarded for a month; null: no limit.",
      ),
    credit_max_percent: z
      .int()
      .min(1)
      .max(100)
      .describe(
        "The most of an order's total store credit can pay, in percent.",
      ),
    credit_expiry_months: z
      .int()
      .positive()
      .nullable()
      .describe("Months before unused credit lapses; null: it never does."),
  })
  .meta({
    id: "ReferralRule",
    description:
      "The referral programme. Each referral keeps the rule it was made under.",
  });
export type ReferralRule = z.infer<typeof ReferralRuleSchema>;

export const StoreSettingsSchema = z
  .object({
    theme: StoreThemeSchema,
    heading_font: StoreHeadingFontSchema.nullable().describe(
      "The headline font in place of the theme's; null is the theme's own.",
    ),
    corners: StoreCornersSchema.nullable().describe(
      "The corner style in place of the theme's; null is the theme's own.",
    ),
    announcements: z
      .array(z.string())
      .describe(
        "The messages in the storefront's scrolling top banner, in order; empty hides it.",
      ),
    announcements_enabled: z
      .boolean()
      .describe("Whether the banner shows; off keeps its messages."),
    business_name: z
      .string()
      .describe("The seller's registered name; empty until an admin sets it."),
    business_id: z
      .string()
      .describe("The seller's business ID (Finnish Y-tunnus)."),
    business_address: z
      .string()
      .describe("The seller's address, one line per line."),
    business_email: z
      .string()
      .describe("Where customers can reach the seller."),
    business_phone: z.string().describe("The seller's phone number; optional."),
    shipping: ShippingRuleSchema,
    referrals: ReferralRuleSchema,
    logo_url: z
      .url()
      .nullable()
      .describe("The store's uploaded logo; null shows the built-in mark."),
    updated_at: Timestamp,
  })
  .meta({ id: "StoreSettings", description: "Store-wide settings." });
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

export const StoreThemeBodySchema = z
  .object({
    theme: StoreThemeSchema,
    heading_font: StoreHeadingFontSchema.nullish().describe(
      "Left out or null for the theme's own.",
    ),
    corners: StoreCornersSchema.nullish().describe(
      "Left out or null for the theme's own.",
    ),
  })
  .meta({
    id: "StoreThemeBody",
    description:
      "Replaces the store's look: its theme, and the headline font and corners it uses in place of the theme's.",
  });
export type StoreThemeBody = z.infer<typeof StoreThemeBodySchema>;

export const StoreLogoBodySchema = z
  .object({
    logo_url: z
      .url({ protocol: /^https$/, error: "Upload the logo again" })
      .max(500, "Upload the logo again")
      .nullish()
      .describe(
        "An uploaded image's https URL; null or left out goes back to the built-in mark.",
      ),
  })
  .meta({
    id: "StoreLogoBody",
    description: "Replaces the logo in the store's header.",
  });
export type StoreLogoBody = z.infer<typeof StoreLogoBodySchema>;

export const AnnouncementsBodySchema = z
  .object({
    announcements_enabled: z
      .boolean()
      .describe("Show the banner, or hide it and keep its messages."),
    announcements: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Write a message or remove it")
          .max(
            MAX_ANNOUNCEMENT_LENGTH,
            `Keep each message to ${MAX_ANNOUNCEMENT_LENGTH} characters`,
          ),
      )
      .max(
        MAX_ANNOUNCEMENTS,
        `The banner holds at most ${MAX_ANNOUNCEMENTS} messages`,
      ),
  })
  .meta({
    id: "AnnouncementsBody",
    description:
      "Turns the banner on or off and replaces its messages, in order. An empty list hides it too.",
  });
export type AnnouncementsBody = z.infer<typeof AnnouncementsBodySchema>;

const businessField = (key: keyof typeof BUSINESS_LIMITS, label: string) =>
  z
    .string()
    .trim()
    .max(
      BUSINESS_LIMITS[key],
      `Keep the ${label} to ${BUSINESS_LIMITS[key]} characters`,
    );

export const BusinessDetailsBodySchema = z
  .object({
    business_name: businessField("business_name", "business name"),
    business_id: businessField("business_id", "business ID"),
    business_address: businessField("business_address", "address"),
    business_email: businessField("business_email", "email").refine(
      (v) => v === "" || z.email().safeParse(v).success,
      "Enter a valid email address",
    ),
    business_phone: businessField("business_phone", "phone number"),
  })
  .meta({
    id: "BusinessDetailsBody",
    description:
      "Replaces the seller's details shown in the footer, contact page and legal pages. Empty strings clear a field.",
  });
export type BusinessDetailsBody = z.infer<typeof BusinessDetailsBodySchema>;

export const ShippingBodySchema = z
  .object({
    flat: z
      .int()
      .min(0, "The delivery price can't be negative")
      .max(SHIPPING_LIMITS.flat, "Keep the delivery price to €1,000 or less")
      .describe("Cents, 0 to 100000; 0 ships every order free."),
    free_from: z
      .int()
      .min(1, "Free delivery needs a threshold above €0")
      .max(
        SHIPPING_LIMITS.free_from,
        "Keep the free delivery threshold to €100,000 or less",
      )
      .nullish()
      .describe("Cents, 1 to 10000000; left out or null: no amount rule."),
    free_items: z
      .int()
      .min(1, "Free delivery needs at least 1 item")
      .max(SHIPPING_LIMITS.free_items, "Keep the item count to 100 or less")
      .nullish()
      .describe("Items, 1 to 100; left out or null: no item rule."),
  })
  .meta({
    id: "ShippingBody",
    description:
      "Replaces what delivery costs: the flat price, and the subtotal (after any discount code) or item count from which orders ship free.",
  });
export type ShippingBody = z.infer<typeof ShippingBodySchema>;

export const ReferralBodySchema = z
  .object({
    enabled: z
      .boolean()
      .describe("Run the programme, or pause it and keep its rule."),
    friend_kind: ReferralFriendKindSchema,
    friend_value: z
      .int()
      .min(1, "The friend's discount needs to be above 0")
      .max(
        REFERRAL_LIMITS.amount,
        "Keep the friend's discount to €1,000 or less",
      )
      .describe("Cents, 1 to 100000, or a percent, 1 to 50."),
    friend_min: z
      .int()
      .min(1, "The minimum order needs to be above €0")
      .max(REFERRAL_LIMITS.amount, "Keep the minimum order to €1,000 or less")
      .nullish()
      .describe("Cents, 1 to 100000; left out or null: no minimum."),
    reward: z
      .int()
      .min(1, "The referrer's credit needs to be above €0")
      .max(
        REFERRAL_LIMITS.amount,
        "Keep the referrer's credit to €1,000 or less",
      )
      .describe("Cents, 1 to 100000."),
    pay_after_days: z
      .int()
      .min(0, "The wait can't be negative")
      .max(REFERRAL_LIMITS.pay_after_days, "Keep the wait to 365 days or less")
      .describe("Days, 0 to 365; 0 pays as soon as the order is paid."),
    custom_prints: z.boolean(),
    monthly_cap: z
      .int()
      .min(1, "The monthly cap needs at least 1 referral")
      .max(REFERRAL_LIMITS.monthly_cap, "Keep the monthly cap to 100 or less")
      .nullish()
      .describe("Referrals, 1 to 100; left out or null: no limit."),
    credit_max_percent: z
      .int()
      .min(1, "Credit needs to pay at least 1% of an order")
      .max(100, "Credit can pay at most 100% of an order")
      .describe("Percent, 1 to 100."),
    credit_expiry_months: z
      .int()
      .min(1, "Credit needs at least 1 month before it lapses")
      .max(
        REFERRAL_LIMITS.expiry_months,
        "Keep the expiry to 60 months or less",
      )
      .nullish()
      .describe("Months, 1 to 60; left out or null: credit never lapses."),
  })
  .refine(
    (b) =>
      b.friend_kind !== "percent" || b.friend_value <= REFERRAL_LIMITS.percent,
    {
      message: "Keep the friend's discount to 50% or less",
      path: ["friend_value"],
    },
  )
  .meta({
    id: "ReferralBody",
    description:
      "Replaces the referral programme: whether it runs, the friend's discount, the referrer's credit and when it's paid, and the limits on credit. Referrals already made keep their rule.",
  });
export type ReferralBody = z.infer<typeof ReferralBodySchema>;

export const StoreSettingsResponseSchema = successResponse(
  StoreSettingsSchema,
).meta({ id: "StoreSettingsResponse" });
export type StoreSettingsResponse = z.infer<typeof StoreSettingsResponseSchema>;
