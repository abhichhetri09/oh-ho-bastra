import type { StoreTheme } from "@repo/types";

/**
 * Store themes. Each id matches a [data-theme] block in app/globals.css
 * (Editorial is also the :root default) and the API's StoreTheme enum. The
 * store's look is the theme an admin saved (falling back to STORE_THEME);
 * with DEMO_THEME_PICKER on, a visitor's pick (the cookie) overrides it.
 */
export const THEMES = [
  {
    id: "editorial",
    name: "Editorial",
    description: "Warm paper, a light serif, square corners.",
    // background, foreground, accent: the picker's preview strip
    preview: ["#faf8f4", "#24201c", "#a4502f"],
    themeColor: "#faf8f4",
  },
  {
    id: "studio",
    name: "Studio",
    description: "Crisp white, bold sans-serif, soft corners.",
    preview: ["#fdfdfd", "#1d1e22", "#2b52c8"],
    themeColor: "#fdfdfd",
  },
  {
    id: "botanical",
    name: "Botanical",
    description: "Cream and forest green, a soft serif, rounded shapes.",
    preview: ["#f8f5ea", "#2a4636", "#b65c3b"],
    themeColor: "#f8f5ea",
  },
] as const satisfies readonly {
  id: StoreTheme;
  name: string;
  description: string;
  preview: readonly string[];
  themeColor: string;
}[];

export type ThemeId = (typeof THEMES)[number]["id"];
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeId = "editorial";
export const THEME_COOKIE = "cs-theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function themeById(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * The theme a page renders with: the store's configured theme, or a
 * visitor's pick while the demo picker is on. Unknown values fall back.
 */
export function resolveTheme({
  cookie,
  storeTheme,
  pickerEnabled,
}: {
  cookie: string | undefined;
  storeTheme: string | undefined;
  pickerEnabled: boolean;
}): ThemeId {
  if (pickerEnabled && isThemeId(cookie)) return cookie;
  return isThemeId(storeTheme) ? storeTheme : DEFAULT_THEME;
}

/** DEMO_THEME_PICKER=true (server-only env) shows the picker. */
export function themePickerEnabled(
  value = process.env.DEMO_THEME_PICKER,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
