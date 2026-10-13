import { z } from "zod";
import { successResponse, Timestamp } from "../api/response";

/** The storefront themes (apps/web/lib/themes.ts holds their look). */
export const StoreThemeSchema = z
  .enum(["editorial", "studio", "botanical"])
  .meta({ id: "StoreTheme" });
export type StoreTheme = z.infer<typeof StoreThemeSchema>;

export const StoreSettingsSchema = z
  .object({
    theme: StoreThemeSchema,
    updated_at: Timestamp,
  })
  .meta({ id: "StoreSettings", description: "Store-wide settings." });
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

export const StoreThemeBodySchema = z
  .object({ theme: StoreThemeSchema })
  .meta({ id: "StoreThemeBody" });
export type StoreThemeBody = z.infer<typeof StoreThemeBodySchema>;

export const StoreSettingsResponseSchema = successResponse(
  StoreSettingsSchema,
).meta({ id: "StoreSettingsResponse" });
export type StoreSettingsResponse = z.infer<typeof StoreSettingsResponseSchema>;
