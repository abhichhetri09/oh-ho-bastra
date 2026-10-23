import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PageShell } from "@/components/layout/PageShell";
import { Loading } from "@/components/feedback/QueryView";
import type { SessionUser } from "@/features/auth/auth-client";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { signInPath } from "@/lib/redirect";

/** Renders children for a signed-in user; sends everyone else to sign-in. */
export function RequireUser({ children }: { children: (user: SessionUser) => ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { user, isPending } = useSessionUser();

  // Come back here after signing in.
  useEffect(() => {
    if (!isPending && !user) void navigate(signInPath(pathname + search), { replace: true });
  }, [isPending, user, navigate, pathname, search]);

  if (!user) {
    return (
      <PageShell>
        <Loading label="Checking session…" />
      </PageShell>
    );
  }
  return <>{children(user)}</>;
}
