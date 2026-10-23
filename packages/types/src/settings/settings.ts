import { z } from "zod";
import { successResponse, Timestamp } from "../api/response";

/** The storefront themes (apps/web/lib/themes.ts holds their look). */
export const StoreThemeSchema = z
  .enum(["editorial", "studio", "botanical"])
  .meta({ id: "StoreTheme" });
export type StoreTheme = z.infer<typeof StoreThemeSchema>;

/** Limits of the scrolling top banner. */
export const MAX_ANNOUNCEMENTS = 6;
export const MAX_ANNOUNCEMENT_LENGTH = 80;

export const StoreSettingsSchema = z
  .object({
    theme: StoreThemeSchema,
    announcements: z
      .array(z.string())
      .describe(
        "The messages in the storefront's scrolling top banner, in order; empty hides it.",
      ),
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
      "Replaces the banner's messages, in order. An empty list hides the banner.",
  });
export type AnnouncementsBody = z.infer<typeof AnnouncementsBodySchema>;

export const StoreSettingsResponseSchema = successResponse(
  StoreSettingsSchema,
).meta({ id: "StoreSettingsResponse" });
export type StoreSettingsResponse = z.infer<typeof StoreSettingsResponseSchema>;
