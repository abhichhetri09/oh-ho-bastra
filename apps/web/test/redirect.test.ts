import { describe, expect, test } from "bun:test";
import { homeFor, loginPath, safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  test.each([
    ["/account", "/account"],
    ["/products/x?a=1#top", "/products/x?a=1#top"],
    ["/a/../b", "/b"],
  ])("keeps on-site path %s", (input, want) => {
    expect(safeNextPath(input)).toBe(want);
  });

  test.each([
    null,
    undefined,
    "",
    "account",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
  ])("rejects %p", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});

test("loginPath", () => {
  expect(loginPath("/account?tab=1")).toBe(
    "/auth/login?next=%2Faccount%3Ftab%3D1",
  );
  expect(loginPath("/")).toBe("/auth/login");
  expect(loginPath("//evil.com")).toBe("/auth/login");
  expect(loginPath()).toBe("/auth/login");
});

test("homeFor", () => {
  expect(homeFor("admin")).toBe("/admin");
  expect(homeFor("customer")).toBe("/");
});
