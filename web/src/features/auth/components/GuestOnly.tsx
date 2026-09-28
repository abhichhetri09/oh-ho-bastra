import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useSessionUser } from "@/features/auth/useSessionUser";
import { safeNext } from "@/lib/redirect";

/**
 * For sign-in / sign-up: signed-in visitors go straight to where they were headed.
 * The form stays mounted while the session is (re)checked so typed input is never lost.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useSessionUser();
  const { search } = useLocation();
  return user ? <Navigate to={safeNext(search)} replace /> : <>{children}</>;
}
