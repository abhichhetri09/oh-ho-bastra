import { NavLink } from "react-router-dom";

import { Dashboard, LogIn, LogOut } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { accountLinks } from "@/features/account/nav";
import { useSessionUser } from "@/features/auth/useSessionUser";
import { AccountMenu } from "./AccountMenu";
import { navLinkClass, type NavVariant } from "./nav-config";
import { useSignOut } from "./useSignOut";

/** Account menu (desktop) or account section (mobile) when signed in; sign in / sign up otherwise. */
export function AccountLinks({ variant, onNavigate }: { variant: NavVariant; onNavigate?: () => void }) {
  const { user, isPending, isAdmin } = useSessionUser();
  const signOut = useSignOut();
  const mobile = variant === "mobile";
  const linkClass = navLinkClass(variant);

  if (isPending) return null;

  if (user && !mobile) return <AccountMenu user={user} isAdmin={isAdmin} />;

  if (user) {
    return (
      <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar name={user.name} size="sm" className="bg-white text-black" />
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{user.name}</p>
            <p className="truncate text-xs text-white/60">{user.email}</p>
          </div>
        </div>
        {accountLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass} onClick={onNavigate}>
            <Icon />
            {label}
          </NavLink>
        ))}
        {isAdmin ? (
          <NavLink to="/admin" className={linkClass} onClick={onNavigate}>
            <Dashboard />
            Admin dashboard
          </NavLink>
        ) : null}
        <button type="button" className={linkClass({ isActive: false })} onClick={() => void signOut()}>
          <LogOut />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className={mobile ? "mt-3 flex flex-col gap-2 px-1" : "contents"}>
      {mobile ? (
        <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
          <NavLink to="/sign-in" onClick={onNavigate}>
            Sign in
          </NavLink>
        </Button>
      ) : (
        <NavLink to="/sign-in" className={linkClass} onClick={onNavigate}>
          <LogIn />
          Sign in
        </NavLink>
      )}
      <Button size={mobile ? "default" : "sm"} className="bg-white text-black hover:bg-white/90" asChild>
        <NavLink to="/sign-up" onClick={onNavigate}>
          Sign up
        </NavLink>
      </Button>
    </div>
  );
}
