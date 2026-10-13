// Unsigned test tokens: userFromAccessToken never checks the signature.
export function token(claims: Record<string, unknown>): string {
  const b64 = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

export const accessClaims = (overrides: Record<string, unknown> = {}) => ({
  user_id: "0b7c1e1e-8a52-4a8e-9a43-0d1f5b2f3c4d",
  role: "customer",
  email: "user@example.com",
  name: "Test User",
  typ: "access",
  exp: nowSec() + 600,
  ...overrides,
});
