import { NavLink } from "react-router-dom";

import { Close, Menu } from "@/components/icons";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { AccountLinks } from "./AccountLinks";
import { BagLink } from "./BagLink";
import { MobileMenu } from "./MobileMenu";
import { navLinkClass, useShopLinks } from "./nav-config";
import { useMobileMenu } from "./useMobileMenu";

export function Header() {
  const menu = useMobileMenu();
  const shopLinks = useShopLinks();

  return (
    <header className="sticky top-0 z-50 bg-black text-white">
      <div className="flex items-center justify-between gap-4 px-6 py-3 lg:px-10">
        <NavLink to="/" className="shrink-0" aria-label="Oh Ho home">
          <Logo className="h-10" />
        </NavLink>

        <nav className="hidden items-center gap-0.5 md:flex">
          {shopLinks.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={navLinkClass("desktop")}>
              {label}
            </NavLink>
          ))}
          <BagLink variant="desktop" />
          <AccountLinks variant="desktop" />
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <BagLink variant="mobile" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-expanded={menu.open}
            aria-controls="mobile-nav"
            aria-label={menu.open ? "Close menu" : "Open menu"}
            onClick={menu.toggle}
          >
            {menu.open ? <Close /> : <Menu />}
          </Button>
        </div>
      </div>

      {menu.open ? <MobileMenu onClose={menu.close} /> : null}
    </header>
  );
}
