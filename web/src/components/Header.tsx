import { NavLink } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient, getSessionUser } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  const user = getSessionUser(session);

  return (
    <header className="flex items-center justify-between gap-4 bg-black px-6 py-3 text-white">
      <NavLink to="/" className="shrink-0" aria-label="Oh Ho home">
        <Logo className="h-11" />
      </NavLink>
      <nav className="flex items-center gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-white hover:bg-white/10 hover:text-white",
              isActive && "bg-white/15",
            )
          }
        >
          Shop
        </NavLink>
        {isPending ? null : user ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 hover:text-white"
            asChild
          >
            <NavLink to="/account">{user.name}</NavLink>
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white"
              asChild
            >
              <NavLink to="/sign-in">Sign in</NavLink>
            </Button>
            <Button
              size="sm"
              className="bg-white text-black hover:bg-white/90"
              asChild
            >
              <NavLink to="/sign-up">Sign up</NavLink>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
