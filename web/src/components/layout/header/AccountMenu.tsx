import { useState } from "react";
import { Link } from "react-router-dom";

import { ChevronDown, Dashboard, LogOut } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { accountLinks } from "@/features/account/nav";
import type { SessionUser } from "@/features/auth/auth-client";
import { useDismiss } from "@/hooks/useDismiss";
import { cn } from "@/lib/utils";
import { useSignOut } from "./useSignOut";

const item = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-secondary";

/** Avatar button in the store header that opens the account menu. */
export function AccountMenu({ user, isAdmin }: { user: SessionUser; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const signOut = useSignOut();

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white",
          open && "bg-white/10 text-white",
        )}
      >
        <Avatar name={user.name} size="sm" className="bg-white text-black" />
        <span className="max-w-32 truncate">{user.name.split(" ")[0]}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border bg-background p-1.5 text-foreground shadow-xl">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          {accountLinks.map(({ to, label, icon: Icon }) => (
            <Link key={to} role="menuitem" to={to} onClick={close} className={item}>
              <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          ))}
          {isAdmin ? (
            <>
              <div className="my-1 h-px bg-border" />
              <Link role="menuitem" to="/admin" onClick={close} className={item}>
                <Dashboard className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                Admin dashboard
              </Link>
            </>
          ) : null}
          <div className="my-1 h-px bg-border" />
          <button role="menuitem" type="button" onClick={() => void signOut()} className={item}>
            <LogOut className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
