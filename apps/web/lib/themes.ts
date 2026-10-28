import type { StoreCorners, StoreHeadingFont, StoreTheme } from "@repo/types";

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
    description: "Warm paper, a light serif, softly rounded corners.",
    // its own headline face (a HEADING_FONTS id)
    font: "instrument-serif",
    // background, foreground, accent: the picker's preview strip
    preview: ["#faf8f4", "#24201c", "#a4502f"],
    themeColor: "#faf8f4",
  },
  {
    id: "studio",
    name: "Studio",
    description: "Crisp white, bold sans-serif, soft corners.",
    font: "geist",
    preview: ["#fdfdfd", "#1d1e22", "#2b52c8"],
    themeColor: "#fdfdfd",
  },
  {
    id: "botanical",
    name: "Botanical",
    description: "Cream and forest green, a soft serif, rounded shapes.",
    font: "fraunces",
    preview: ["#f8f5ea", "#2a4636", "#b65c3b"],
    themeColor: "#f8f5ea",
  },
  {
    id: "blaze",
    name: "Blaze",
    description: "Signal orange on white and black, bold sans, square corners.",
    font: "geist",
    preview: ["#ffffff", "#0a0a0a", "#f46b10"],
    themeColor: "#ffffff",
  },
] as const satisfies readonly {
  id: StoreTheme;
  name: string;
  description: string;
  font: StoreHeadingFont;
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

/**
 * Headline faces a store can use in place of its theme's. Each id matches a
 * [data-font] block in app/globals.css (which sets the headline tokens) and
 * the API's StoreHeadingFont enum; the faces load in lib/fonts.ts. Wide
 * faces get a smaller logo wordmark (see appearanceAttributes).
 */
export const HEADING_FONTS = [
  {
    id: "instrument-serif",
    name: "Instrument Serif",
    character: "Elegant serif",
    wide: false,
  },
  { id: "fraunces", name: "Fraunces", character: "Soft serif", wide: true },
  {
    id: "playfair",
    name: "Playfair Display",
    character: "Classic serif",
    wide: true,
  },
  { id: "geist", name: "Geist", character: "Clean sans", wide: true },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    character: "Quirky sans",
    wide: true,
  },
  { id: "archivo", name: "Archivo", character: "Heavy sans", wide: true },
] as const satisfies readonly {
  id: StoreHeadingFont;
  name: string;
  character: string;
  wide: boolean;
}[];

export type HeadingFontId = (typeof HEADING_FONTS)[number]["id"];
export type HeadingFont = (typeof HEADING_FONTS)[number];

/**
 * Corner styles a store can use in place of its theme's: [data-corners]
 * blocks in app/globals.css, and the API's StoreCorners enum.
 */
export const CORNERS = [
  { id: "sharp", name: "Sharp" },
  { id: "soft", name: "Soft" },
  { id: "round", name: "Round" },
] as const satisfies readonly { id: StoreCorners; name: string }[];

export type CornersId = (typeof CORNERS)[number]["id"];

export function isHeadingFontId(value: unknown): value is HeadingFontId {
  return HEADING_FONTS.some((font) => font.id === value);
}

export function headingFontById(id: HeadingFontId): HeadingFont {
  return HEADING_FONTS.find((font) => font.id === id) ?? HEADING_FONTS[0];
}

export function isCornersId(value: unknown): value is CornersId {
  return CORNERS.some((corners) => corners.id === value);
}

/**
 * How the store looks: a theme, and the headline font and corners it uses
 * in place of the theme's (null: the theme's own).
 */
export type Appearance = {
  theme: ThemeId;
  font: HeadingFontId | null;
  corners: CornersId | null;
};

/** The headline face a page shows: the store's pick, or its theme's own. */
export function headlineFont({
  theme,
  font,
}: Pick<Appearance, "theme" | "font">): HeadingFontId {
  return font ?? themeById(theme).font;
}

/**
 * The <html> attributes for an appearance. data-font and data-corners only
 * when the store picked one, so the theme's own apply otherwise;
 * data-headline="wide" when the headline face is wide, for the logo
 * wordmark to shrink (in-data-[headline=wide]:…).
 */
export function appearanceAttributes(appearance: Appearance) {
  return {
    "data-theme": appearance.theme,
    "data-font": appearance.font ?? undefined,
    "data-corners": appearance.corners ?? undefined,
    "data-headline": headingFontById(headlineFont(appearance)).wide
      ? "wide"
      : undefined,
  };
}

/**
 * Puts an appearance on an element at once (the admin's live preview and
 * the demo picker); the same attributes as appearanceAttributes.
 */
export function applyAppearance(element: HTMLElement, appearance: Appearance) {
  for (const [name, value] of Object.entries(
    appearanceAttributes(appearance),
  )) {
    if (value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.theme === b.theme && a.font === b.font && a.corners === b.corners;
}

/** An appearance in words: "Studio with Playfair Display and round corners". */
export function appearanceName(appearance: Appearance): string {
  const extras = [
    appearance.font && headingFontById(appearance.font).name,
    appearance.corners && `${appearance.corners} corners`,
  ].filter(Boolean);
  const name = themeById(appearance.theme).name;
  return extras.length ? `${name} with ${extras.join(" and ")}` : name;
}
