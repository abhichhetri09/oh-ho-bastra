import * as t from "@repo/types";
import { registry } from "./registry.ts";

// The @repo/types schemas carry their component name in zod's own metadata
// (`.meta({ id })`), so every use is emitted as a $ref and each component is
// registered the first time a path references it.
export const schemas = t;

export const ACCESS_COOKIE = "accessTokenCookie";
export const REFRESH_COOKIE = "refreshTokenCookie";

registry.registerComponent("securitySchemes", ACCESS_COOKIE, {
  type: "apiKey",
  in: "cookie",
  name: "access_token",
  description:
    "HTTP-only JWT access token cookie (15 minutes), set by register, login and refresh.",
});

registry.registerComponent("securitySchemes", REFRESH_COOKIE, {
  type: "apiKey",
  in: "cookie",
  name: "refresh_token",
  description:
    "HTTP-only refresh token cookie for the session (30 days rolling, at most 90 days).",
});
