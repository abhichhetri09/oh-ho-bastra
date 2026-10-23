import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getStoreSettings } from "@repo/api-client/server";
import type { StoreSettings } from "@repo/types";
import { publicClient, SETTINGS_TAG } from "./api/public";
import { site } from "./site";
import {
  resolveTheme,
  THEME_COOKIE,
  themePickerEnabled,
  type ThemeId,
} from "./themes";

const SETTINGS_TTL = 300;
// The root layout waits on this, so a slow API must not hold pages hostage.
const SETTINGS_TIMEOUT_MS = 2000;

/**
 * What an admin saved in Admin → Settings (the theme and the top banner's
 * messages), through Next's data cache (expired on save). Null when the API
 * can't answer, so callers fall back and pages still render.
 */
export const storeSettings = cache(async (): Promise<StoreSettings | null> => {
  try {
    const { data } = await getStoreSettings({
      client: publicClient(SETTINGS_TTL, [SETTINGS_TAG]),
      signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
    });
    if (data) return data.data;
  } catch {
    // the callers' fallbacks
  }
  return null;
});

/** The theme an admin saved, or STORE_THEME when the API can't answer. */
export async function savedStoreTheme(): Promise<string | undefined> {
  return (await storeSettings())?.theme ?? process.env.STORE_THEME;
}

/**
 * The top banner's messages an admin saved (empty hides the banner), or the
 * store's default ones when the API can't answer.
 */
export async function storeAnnouncements(): Promise<string[]> {
  return (await storeSettings())?.announcements ?? [...site.announcement];
}

/** The theme this request renders with (see resolveTheme). */
export async function currentTheme(): Promise<ThemeId> {
  const [cookieStore, storeTheme] = await Promise.all([
    cookies(),
    savedStoreTheme(),
  ]);
  return resolveTheme({
    cookie: cookieStore.get(THEME_COOKIE)?.value,
    storeTheme,
    pickerEnabled: themePickerEnabled(),
  });
}
