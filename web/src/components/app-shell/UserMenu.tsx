import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { ChevronDown, Dashboard, ExternalLink, LogOut, User } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { useSignOut } from "@/components/layout/header/useSignOut";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { useDismiss } from "@/hooks/useDismiss";

/** Signed-in user, with links to the store and the other app area, and sign out. */
export function UserMenu() {
  const { user, isAdmin } = useSessionUser();
  const { pathname } = useLocation();
  const inAdmin = pathname.startsWith("/admin");
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  if (!user) return null;

  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary";
  return (
    <div ref={ref} className="relative">
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 mb-2 w-full rounded-md border bg-background p-1 shadow-lg">
          <Link role="menuitem" to="/" className={item}>
            <ExternalLink className="size-4" aria-hidden />
            View store
          </Link>
          {inAdmin ? (
            <Link role="menuitem" to="/account" className={item}>
              <User className="size-4" aria-hidden />
              My account
            </Link>
          ) : isAdmin ? (
            <Link role="menuitem" to="/admin" className={item}>
              <Dashboard className="size-4" aria-hidden />
              Admin dashboard
            </Link>
          ) : null}
          <button role="menuitem" type="button" className={item} onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-background/70"
      >
        <Avatar name={user.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </div>
  );
}
