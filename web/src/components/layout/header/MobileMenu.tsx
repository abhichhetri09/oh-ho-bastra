import { NavLink } from "react-router-dom";

import { AccountLinks } from "./AccountLinks";
import { navLinkClass, useShopLinks } from "./nav-config";

export function MobileMenu({ onClose }: { onClose: () => void }) {
  const shopLinks = useShopLinks();
  return (
    <div className="md:hidden">
      <button
        type="button"
        className="fixed inset-0 top-16 z-40 bg-black/50"
        aria-label="Close menu"
        onClick={onClose}
      />
      <nav id="mobile-nav" className="relative z-50 space-y-1 border-t border-white/10 px-4 py-4">
        {shopLinks.map(({ to, label, end, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass("mobile")} onClick={onClose}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <AccountLinks variant="mobile" onNavigate={onClose} />
      </nav>
    </div>
  );
}
