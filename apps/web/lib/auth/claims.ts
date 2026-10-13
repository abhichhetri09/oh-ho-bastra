import { jwtDecode } from "jwt-decode";
import { UserRoleSchema, type PublicUser } from "@repo/types";

// Claim names of AccessClaims in apps/api/internal/auth/claims.go.
type AccessClaims = {
  user_id?: unknown;
  role?: unknown;
  email?: unknown;
  name?: unknown;
  image_url?: unknown;
  typ?: unknown;
  exp?: unknown;
};

/**
 * Reads the user from an access token WITHOUT verifying its signature. Only
 * for UI and routing decisions: the API verifies the token on every request,
 * so a forged cookie gets an empty page shell and nothing else.
 * Returns null for a missing, malformed or expired token.
 */
export function userFromAccessToken(
  token: string | undefined,
  now: number = Date.now(),
): PublicUser | null {
  if (!token) return null;

  let claims: AccessClaims;
  try {
    claims = jwtDecode<AccessClaims>(token);
  } catch {
    return null;
  }

  const role = UserRoleSchema.safeParse(claims.role);
  if (
    claims.typ !== "access" ||
    typeof claims.user_id !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.name !== "string" ||
    !role.success ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= now
  ) {
    return null;
  }

  return {
    id: claims.user_id,
    name: claims.name,
    email: claims.email,
    role: role.data,
    image_url: typeof claims.image_url === "string" ? claims.image_url : null,
  };
}
