import { z } from "zod";
import { successResponse, Timestamp } from "../api/response";

/** The storefront themes (apps/web/lib/themes.ts holds their look). */
export const StoreThemeSchema = z
  .enum(["editorial", "studio", "botanical", "blaze"])
  .meta({ id: "StoreTheme" });
export type StoreTheme = z.infer<typeof StoreThemeSchema>;

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

export const StoreSettingsSchema = z
  .object({
    theme: StoreThemeSchema,
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
    updated_at: Timestamp,
  })
  .meta({ id: "StoreSettings", description: "Store-wide settings." });
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

export const StoreThemeBodySchema = z
  .object({ theme: StoreThemeSchema })
  .meta({ id: "StoreThemeBody" });
export type StoreThemeBody = z.infer<typeof StoreThemeBodySchema>;

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

export const StoreSettingsResponseSchema = successResponse(
  StoreSettingsSchema,
).meta({ id: "StoreSettingsResponse" });
export type StoreSettingsResponse = z.infer<typeof StoreSettingsResponseSchema>;
