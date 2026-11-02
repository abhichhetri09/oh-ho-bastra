"use client";

import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { AddToBag } from "@/modules/cart/components/add-to-bag";
import type { LinePreview } from "@/modules/cart/lib/cart-math";

/** How far toasts rise on phones above the bar (its height). */
const TOAST_LIFT = "5.5rem";

/**
 * On phones, the product page buys from here, app style: a quantity stepper
 * and Add to bag pinned to the bottom of the screen the whole time. The
 * page's own Add to bag and the site footer hide below lg (globals.css).
 */
export function StickyBuyBar({
  preview,
  stock,
  inBag,
}: {
  preview: LinePreview;
  stock: number;
  inBag: number;
}) {
  // Toasts sit above the bar instead of on it (see the Toaster's offset).
  useEffect(() => {
    if (!window.matchMedia("(width < 64rem)").matches) return;
    const root = document.documentElement.style;
    root.setProperty("--toast-lift", TOAST_LIFT);
    return () => {
      root.removeProperty("--toast-lift");
    };
  }, []);

  // What can still go in the bag; the stepper never offers more.
  const left = Math.max(stock - inBag, 0);
  const [quantity, setQuantity] = useState(1);
  const qty = Math.min(quantity, Math.max(left, 1));

  return (
    <div
      data-buy-bar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_rgb(0_0_0/0.2)] lg:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 shrink-0 items-center rounded-xl bg-muted">
          <button
            type="button"
            aria-label="One fewer"
            disabled={qty <= 1}
            onClick={() => setQuantity(qty - 1)}
            className="grid size-12 place-items-center disabled:opacity-40"
          >
            <MinusIcon />
          </button>
          <span className="w-6 text-center tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            aria-label="One more"
            disabled={qty >= left}
            onClick={() => setQuantity(qty + 1)}
            className="grid size-12 place-items-center disabled:opacity-40"
          >
            <PlusIcon />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <AddToBag
            preview={preview}
            stock={stock}
            inBag={inBag}
            quantity={qty}
          />
        </div>
      </div>
    </div>
  );
}
