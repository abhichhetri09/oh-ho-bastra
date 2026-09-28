import { NavLink, useLocation } from "react-router-dom";

import { Bag } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button-variants";
import { useCart } from "@/features/cart/cart-context";
import { useFlyToBag } from "@/features/cart/fly-to-bag-context";
import { cn } from "@/lib/utils";
import { navLinkClass, type NavVariant } from "./nav-config";

/** Bag link that the add-to-bag animation flies into; `bump` replays its pop. */
export function BagLink({ variant }: { variant: NavVariant }) {
  const { pathname } = useLocation();
  const { itemCount } = useCart();
  const { bump } = useFlyToBag();
  const pop = bump > 0 && "bag-pop";

  if (variant === "desktop") {
    return (
      <NavLink
        key={`desktop-bag-${bump}`}
        to="/cart"
        data-bag-target
        className={cn(navLinkClass("desktop")({ isActive: pathname === "/cart" }), pop)}
      >
        <Bag />
        Bag
        {itemCount > 0 ? <span className="tabular-nums text-white">{itemCount}</span> : null}
      </NavLink>
    );
  }

  return (
    <NavLink
      key={`mobile-bag-${bump}`}
      to="/cart"
      data-bag-target
      aria-label={itemCount > 0 ? `Bag, ${itemCount} items` : "Bag"}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "relative text-white hover:bg-white/10 hover:text-white",
        pop,
      )}
    >
      <Bag />
      {itemCount > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-medium text-black tabular-nums">
          {itemCount}
        </span>
      ) : null}
    </NavLink>
  );
}
