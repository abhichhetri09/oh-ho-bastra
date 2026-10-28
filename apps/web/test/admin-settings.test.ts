import { describe, expect, test } from "bun:test";
import {
  isSettingsCurrent,
  SETTINGS_PAGES,
  settingsPage,
} from "@/modules/admin/lib/settings";

describe("settings pages", () => {
  test("each page under /admin/settings", () => {
    expect(SETTINGS_PAGES.map((p) => p.href)).toEqual([
      "/admin/settings/store",
      "/admin/settings/appearance",
      "/admin/settings/announcements",
      "/admin/settings/delivery",
    ]);
    expect(new Set(SETTINGS_PAGES.map((p) => p.id)).size).toBe(
      SETTINGS_PAGES.length,
    );
    expect(settingsPage("delivery").label).toBe("Delivery");
  });

  test("a page is current on itself and nested paths", () => {
    expect(
      isSettingsCurrent("/admin/settings/store", "/admin/settings/store"),
    ).toBe(true);
    expect(
      isSettingsCurrent("/admin/settings/storefront", "/admin/settings/store"),
    ).toBe(false);
    expect(
      isSettingsCurrent(
        "/admin/settings/appearance/preview",
        "/admin/settings/appearance",
      ),
    ).toBe(true);
  });
});
