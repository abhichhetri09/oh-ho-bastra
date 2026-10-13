"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { CheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { loginPath } from "@/lib/auth/redirect";
import { EASE_OUT } from "@/lib/motion";
import { rememberIntent } from "@/modules/auth/lib/pending-intent";
import { useAuth } from "@/providers/auth-provider";
import { useCartMutations } from "../hooks/use-cart-mutations";
import type { LinePreview } from "../lib/cart-math";

/** How long the button says "Added" before it resets. */
const ADDED_FOR = 1800;

/**
 * Adds one of the selected variant. The bag count and the label change at
 * once; a toast confirms with "View bag" once the API agrees, or the add
 * rolls back with its reason. Signed-out shoppers go to sign in and come
 * back to this variant, which is then added for them.
 */
export function AddToBag({
  preview,
  stock,
}: {
  /** The selected variant, shown in the bag before the API answers. */
  preview: LinePreview;
  stock: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const { add } = useCartMutations();
  // When the last add was clicked (0: none showing), so another click
  // restarts the "Added" label's timer.
  const [addedAt, setAddedAt] = useState(0);
  const added = addedAt > 0;

  useEffect(() => {
    if (!addedAt) return;
    const timer = setTimeout(() => setAddedAt(0), ADDED_FOR);
    return () => clearTimeout(timer);
  }, [addedAt]);

  const soldOut = stock === 0;
  const label = soldOut ? "Sold out" : added ? "Added" : "Add to bag";

  function onClick() {
    if (!user) {
      // Back to this exact variant after signing in, and into the bag.
      rememberIntent({ kind: "bag", path: pathname, preview, at: Date.now() });
      router.push(loginPath(pathname + window.location.search));
      return;
    }
    setAddedAt(Date.now());
    add.mutate(
      { variant_id: preview.variant_id, quantity: 1, preview, announce: true },
      // The hook rolls back and says why; the label stops claiming success.
      { onError: () => setAddedAt(0) },
    );
  }

  return (
    <Button
      size="lg"
      className="relative w-full min-w-0 shrink overflow-hidden"
      // Never blocked while saving: each click adds one more.
      disabled={soldOut}
      onClick={onClick}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={label}
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="inline-flex items-center gap-2"
        >
          {added && <CheckIcon weight="bold" />}
          {label}
        </m.span>
      </AnimatePresence>
    </Button>
  );
}
