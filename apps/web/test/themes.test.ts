import { describe, expect, test } from "bun:test";
import {
  StoreCornersSchema,
  StoreHeadingFontSchema,
  StoreThemeSchema,
} from "@repo/types";
import {
  appearanceAttributes,
  appearanceName,
  CORNERS,
  DEFAULT_THEME,
  HEADING_FONTS,
  headlineFont,
  isCornersId,
  isHeadingFontId,
  isThemeId,
  resolveTheme,
  sameAppearance,
  THEMES,
  themeById,
  themePickerEnabled,
} from "@/lib/themes";

describe("themes", () => {
  test("ids", () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      "editorial",
      "studio",
      "botanical",
      "blaze",
    ]);
    expect(isThemeId("studio")).toBe(true);
    expect(isThemeId("dark")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(themeById("botanical").name).toBe("Botanical");
    // the web's themes are exactly the ones the API accepts
    expect(THEMES.map((t) => t.id)).toEqual([...StoreThemeSchema.options]);
  });

  test("the store theme, unless the picker is on and a pick was made", () => {
    const base = {
      cookie: undefined,
      storeTheme: undefined,
      pickerEnabled: false,
    };
    expect(resolveTheme(base)).toBe(DEFAULT_THEME);
    expect(resolveTheme({ ...base, storeTheme: "studio" })).toBe("studio");
    expect(resolveTheme({ ...base, storeTheme: "neon" })).toBe(DEFAULT_THEME);
    // a stale cookie is ignored once the picker is off
    expect(
      resolveTheme({ ...base, cookie: "botanical", storeTheme: "studio" }),
    ).toBe("studio");
    expect(
      resolveTheme({
        cookie: "botanical",
        storeTheme: "studio",
        pickerEnabled: true,
      }),
    ).toBe("botanical");
    expect(
      resolveTheme({
        cookie: "neon",
        storeTheme: "studio",
        pickerEnabled: true,
      }),
    ).toBe("studio");
  });

  test("the picker flag", () => {
    expect(themePickerEnabled("true")).toBe(true);
    expect(themePickerEnabled(" TRUE ")).toBe(true);
    expect(themePickerEnabled("1")).toBe(false);
    expect(themePickerEnabled("")).toBe(false);
    expect(themePickerEnabled(undefined)).toBe(false);
  });
});

describe("fonts and corners", () => {
  test("ids", () => {
    // the web's fonts and corners are exactly the ones the API accepts
    // (the fonts in the admin's order: serifs, then sans)
    expect(HEADING_FONTS.map((f) => f.id).sort()).toEqual(
      [...StoreHeadingFontSchema.options].sort(),
    );
    expect(CORNERS.map((c) => c.id)).toEqual([...StoreCornersSchema.options]);
    expect(isHeadingFontId("playfair")).toBe(true);
    expect(isHeadingFontId("comic-sans")).toBe(false);
    expect(isHeadingFontId(null)).toBe(false);
    expect(isCornersId("round")).toBe(true);
    expect(isCornersId("theme")).toBe(false);
    // every theme names its own face
    for (const theme of THEMES) expect(isHeadingFontId(theme.font)).toBe(true);
  });

  test("the store's font, or the theme's own", () => {
    expect(headlineFont({ theme: "editorial", font: null })).toBe(
      "instrument-serif",
    );
    expect(headlineFont({ theme: "botanical", font: null })).toBe("fraunces");
    expect(headlineFont({ theme: "studio", font: "playfair" })).toBe(
      "playfair",
    );
  });

  test("the <html> attributes, with a wide headline marked", () => {
    expect(
      appearanceAttributes({ theme: "editorial", font: null, corners: null }),
    ).toEqual({
      "data-theme": "editorial",
      "data-font": undefined,
      "data-corners": undefined,
      "data-headline": undefined,
    });
    expect(
      appearanceAttributes({ theme: "studio", font: null, corners: "round" }),
    ).toEqual({
      "data-theme": "studio",
      "data-font": undefined,
      "data-corners": "round",
      "data-headline": "wide",
    });
    // a narrow face on a wide theme, and the other way round
    expect(
      appearanceAttributes({
        theme: "blaze",
        font: "instrument-serif",
        corners: null,
      })["data-headline"],
    ).toBeUndefined();
    expect(
      appearanceAttributes({
        theme: "editorial",
        font: "archivo",
        corners: null,
      }),
    ).toMatchObject({ "data-font": "archivo", "data-headline": "wide" });
  });

  test("names and comparison", () => {
    const studio = { theme: "studio", font: null, corners: null } as const;
    expect(appearanceName(studio)).toBe("Studio");
    expect(appearanceName({ ...studio, font: "playfair" })).toBe(
      "Studio with Playfair Display",
    );
    expect(
      appearanceName({ ...studio, font: "archivo", corners: "sharp" }),
    ).toBe("Studio with Archivo and sharp corners");
    expect(sameAppearance(studio, { ...studio })).toBe(true);
    expect(sameAppearance(studio, { ...studio, corners: "soft" })).toBe(false);
  });
});
