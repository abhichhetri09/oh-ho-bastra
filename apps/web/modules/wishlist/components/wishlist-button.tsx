"use client";

import { AnimatePresence, m } from "motion/react";
import { HeartIcon } from "@phosphor-icons/react";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { useToggleWishlist, useWishlistIds } from "../hooks";

/**
 * A heart that saves the product. Its saved state shows from hydration on
 * (the ids load in the browser), so server and client render the same
 * empty heart first.
 */
export function WishlistButton({
  productId,
  name,
  className,
  variant = "overlay",
}: {
  productId: string;
  name: string;
  className?: string;
  /** overlay: a round chip on a photo; outline: a square button. */
  variant?: "overlay" | "outline";
}) {
  const hydrated = useHydrated();
  const { ids } = useWishlistIds();
  const toggle = useToggleWishlist();
  const saved = hydrated && ids.has(productId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId, !saved, name);
      }}
      aria-pressed={saved}
      aria-label={
        saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`
      }
      className={cn(
        "flex items-center justify-center transition-colors",
        variant === "overlay"
          ? "size-9 rounded-full bg-background/85 text-foreground backdrop-blur hover:bg-background"
          : "size-12 shrink-0 rounded-control border border-border hover:border-foreground",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={saved ? "saved" : "empty"}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
          className="flex"
        >
          <HeartIcon
            weight={saved ? "fill" : "light"}
            className={cn(
              variant === "overlay" ? "size-[18px]" : "size-5",
              saved && "text-clay",
            )}
          />
        </m.span>
      </AnimatePresence>
    </button>
  );
}
