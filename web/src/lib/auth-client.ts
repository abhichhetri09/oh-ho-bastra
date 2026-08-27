import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export type SessionUser = {
  name: string;
  email: string;
};

export function getSessionUser(session: unknown): SessionUser | null {
  if (!session || typeof session !== "object" || !("user" in session)) {
    return null;
  }
  return (session as { user: SessionUser }).user;
}
