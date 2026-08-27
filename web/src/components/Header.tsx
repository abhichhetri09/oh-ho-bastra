import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { Logo } from "@/components/Logo";
import {
  Bag,
  Close,
  Info,
  LogIn,
  Menu,
  Pen,
  Shirt,
  Store,
  User,
} from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient, getSessionUser } from "@/lib/auth-client";
import { useCart } from "@/lib/cart";
import { useFlyToBag } from "@/lib/fly-to-bag";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Shop", end: true, icon: Store },
  { to: "/collections/tees", label: "Tees", icon: Shirt },
  { to: "/collections/custom", label: "Custom", icon: Pen },
  { to: "/about", label: "About", icon: Info },
] as const;

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "text-white/80 hover:bg-white/10 hover:text-white",
    isActive && "bg-white/10 text-white",
  );

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-3 text-base text-white/80 hover:bg-white/10 hover:text-white",
    isActive && "bg-white/10 text-white",
  );

export function Header() {
  const { pathname } = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const user = getSessionUser(session);
  const { itemCount } = useCart();
  const { bump } = useFlyToBag();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const account = isPending ? null : user ? (
    <NavLink
      to="/account"
      className={navClass}
      onClick={() => setOpen(false)}
    >
      <User />
      {user.name}
    </NavLink>
  ) : (
    <>
      <NavLink
        to="/sign-in"
        className={navClass}
        onClick={() => setOpen(false)}
      >
        <LogIn />
        Sign in
      </NavLink>
      <Button
        size="sm"
        className="bg-white text-black hover:bg-white/90"
        asChild
      >
        <NavLink to="/sign-up" onClick={() => setOpen(false)}>
          Sign up
        </NavLink>
      </Button>
    </>
  );

  return (
    <header className="sticky top-0 z-50 bg-black text-white">
      <div className="flex items-center justify-between gap-4 px-6 py-3 lg:px-10">
        <NavLink to="/" className="shrink-0" aria-label="Oh Ho home">
          <Logo className="h-10" />
        </NavLink>

        <nav className="hidden items-center gap-0.5 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={navClass}
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/cart"
            data-bag-target
            className={cn(navClass({ isActive: pathname === "/cart" }), bump > 0 && "bag-pop")}
            key={`desktop-bag-${bump}`}
          >
            <Bag />
            Bag
            {itemCount > 0 ? (
              <span className="tabular-nums text-white">{itemCount}</span>
            ) : null}
          </NavLink>
          {account}
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <NavLink
            to="/cart"
            data-bag-target
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "relative text-white hover:bg-white/10 hover:text-white",
              bump > 0 && "bag-pop",
            )}
            key={`mobile-bag-${bump}`}
            aria-label={itemCount > 0 ? `Bag, ${itemCount} items` : "Bag"}
          >
            <Bag />
            {itemCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-medium text-black tabular-nums">
                {itemCount}
              </span>
            ) : null}
          </NavLink>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <Close /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="md:hidden">
          <button
            type="button"
            className="fixed inset-0 top-16 z-40 bg-black/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-nav"
            className="relative z-50 space-y-1 border-t border-white/10 px-4 py-4"
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={mobileLinkClass}
                onClick={() => setOpen(false)}
              >
                <link.icon />
                {link.label}
              </NavLink>
            ))}
            {isPending ? null : user ? (
              <NavLink
                to="/account"
                className={mobileLinkClass}
                onClick={() => setOpen(false)}
              >
                <User />
                {user.name}
              </NavLink>
            ) : (
              <div className="mt-3 flex flex-col gap-2 px-1">
                <Button
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <NavLink to="/sign-in" onClick={() => setOpen(false)}>
                    Sign in
                  </NavLink>
                </Button>
                <Button
                  className="bg-white text-black hover:bg-white/90"
                  asChild
                >
                  <NavLink to="/sign-up" onClick={() => setOpen(false)}>
                    Sign up
                  </NavLink>
                </Button>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
