import { describe, expect, test } from "bun:test";
import { StoreThemeSchema } from "@repo/types";
import {
  DEFAULT_THEME,
  isThemeId,
  resolveTheme,
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
