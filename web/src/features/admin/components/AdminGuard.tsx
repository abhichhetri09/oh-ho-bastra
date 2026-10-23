import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { BackToShop } from "@/components/common/BackToShop";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Loading } from "@/components/feedback/QueryView";
import { LogIn } from "@/components/icons";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { signInPath } from "@/lib/redirect";

/** The API enforces admin access; this only decides what to show. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isPending, isAdmin } = useSessionUser();
  const { pathname, search } = useLocation();

  if (isPending) {
    return (
      <PageShell>
        <Loading label="Checking session…" />
      </PageShell>
    );
  }
  if (!isAdmin) {
    return (
      <PageShell>
        <EmptyState
          icon={LogIn}
          title="Admins only"
          description={
            user
              ? "Your account does not have admin access."
              : "Sign in with an admin account to manage the shop."
          }
          action={
            user ? (
              <BackToShop />
            ) : (
              <Button asChild>
                <Link to={signInPath(pathname + search)}>Sign in</Link>
              </Button>
            )
          }
        />
      </PageShell>
    );
  }
  return <>{children}</>;
}
