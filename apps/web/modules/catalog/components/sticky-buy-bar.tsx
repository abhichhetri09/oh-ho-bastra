"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AddToBag } from "@/modules/cart/components/add-to-bag";
import { type LinePreview, optionSummary } from "@/modules/cart/lib/cart-math";
import { Price } from "./price";

/** How far toasts rise on phones while the bar shows (its height). */
const TOAST_LIFT = "4.75rem";

/**
 * On phones, once the product page's own Add to bag has scrolled up out of
 * view, a bar with the price and Add to bag slides up from the bottom, so
 * the shopper can buy from the details, reviews or related products.
 * `anchor` wraps the page's buy button; the bar shows only after it, not
 * before the shopper reaches it.
 */
export function StickyBuyBar({
  anchor,
  preview,
  stock,
  price,
  selling,
  offer,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  preview: LinePreview;
  stock: number;
  price: number;
  selling: number;
  offer: number | null;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = anchor.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor]);

  // Toasts sit above the bar instead of on it (see the Toaster's offset).
  useEffect(() => {
    if (!shown) return;
    const root = document.documentElement.style;
    root.setProperty("--toast-lift", TOAST_LIFT);
    return () => {
      root.removeProperty("--toast-lift");
    };
  }, [shown]);

  const options = optionSummary(preview);

  return (
    <div
      // globals.css pads the page by the bar's height on phones, so it
      // never covers the footer's last line.
      data-buy-bar
      inert={!shown}
      aria-hidden={!shown}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md transition-transform duration-500 ease-out-expo lg:hidden",
        shown ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem]">
            {preview.product_name}
            {options && (
              <span className="text-muted-foreground"> · {options}</span>
            )}
          </p>
          <Price
            price={price}
            selling={selling}
            offer={offer}
            className="text-[0.8125rem]"
          />
        </div>
        <div className="w-40 shrink-0">
          <AddToBag preview={preview} stock={stock} />
        </div>
      </div>
    </div>
  );
}
