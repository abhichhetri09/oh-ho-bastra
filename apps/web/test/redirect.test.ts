import { describe, expect, test } from "bun:test";
import {
  accountOf,
  homeFor,
  loginPath,
  registerPath,
  safeNextPath,
} from "@/lib/auth/redirect";

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

test("registerPath fills in an email", () => {
  expect(registerPath("/account/orders")).toBe(
    "/auth/register?next=%2Faccount%2Forders",
  );
  expect(registerPath("/account/orders", "ada+shop@example.com")).toBe(
    "/auth/register?next=%2Faccount%2Forders&email=ada%2Bshop%40example.com",
  );
  expect(registerPath("/", "ada@example.com")).toBe(
    "/auth/register?email=ada%40example.com",
  );
});

test("accountOf: a guest is signed out", () => {
  const customer = { id: "1", role: "customer" as const };
  expect(accountOf(customer)).toBe(customer);
  expect(accountOf({ id: "2", role: "admin" as const })).not.toBeNull();
  expect(accountOf({ id: "3", role: "guest" as const })).toBeNull();
  expect(accountOf(null)).toBeNull();
  expect(accountOf(undefined)).toBeNull();
});
