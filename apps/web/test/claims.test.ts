import { expect, test } from "bun:test";
import { userFromAccessToken } from "@/lib/auth/claims";
import { accessClaims, nowSec, token } from "./jwt";

test("maps user_id to id", () => {
  expect(userFromAccessToken(token(accessClaims()))).toEqual({
    id: "0b7c1e1e-8a52-4a8e-9a43-0d1f5b2f3c4d",
    name: "Test User",
    email: "user@example.com",
    role: "customer",
    image_url: null,
  });
});

test.each([
  ["expired", { exp: nowSec() - 1 }],
  ["refresh token", { typ: "refresh" }],
  ["unknown role", { role: "superadmin" }],
  ["missing exp", { exp: undefined }],
  ["missing user_id", { user_id: undefined }],
])("rejects %s", (_, overrides) => {
  expect(userFromAccessToken(token(accessClaims(overrides)))).toBeNull();
});

test("rejects garbage and missing tokens", () => {
  expect(userFromAccessToken("not.a.jwt")).toBeNull();
  expect(userFromAccessToken(undefined)).toBeNull();
});
