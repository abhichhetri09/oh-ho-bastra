import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getStoreSettings } from "@repo/api-client/server";
import { publicClient, SETTINGS_TAG } from "./api/public";
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
 * The theme an admin saved (Admin → Settings), through Next's data cache
 * (expired on save). If the API can't answer, STORE_THEME stands in, so
 * pages still render.
 */
export const savedStoreTheme = cache(async (): Promise<string | undefined> => {
  try {
    const { data } = await getStoreSettings({
      client: publicClient(SETTINGS_TTL, [SETTINGS_TAG]),
      signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
    });
    if (data) return data.data.theme;
  } catch {
    // fall through to the env default
  }
  return process.env.STORE_THEME;
});

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
