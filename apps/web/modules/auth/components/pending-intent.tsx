"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useCartMutations } from "@/modules/cart/hooks/use-cart-mutations";
import { useToggleWishlist } from "@/modules/wishlist/hooks";
import { rememberIntent, takeIntent } from "../lib/pending-intent";

/**
 * Finishes what a shopper tapped before signing in (add to bag, save) once
 * they're back on that page signed in. The usual toasts confirm it. An add
 * runs for a guest too (its session starts on the first add); a save waits
 * for an account.
 */
export function PendingIntentRunner() {
  const pathname = usePathname();
  const signedIn = useAuth((s) => Boolean(s.user));
  const guest = useAuth((s) => s.user?.role === "guest");
  const { add } = useCartMutations();
  const toggle = useToggleWishlist();

  useEffect(() => {
    if (!signedIn) return;
    const intent = takeIntent(pathname);
    if (intent?.kind === "save" && guest) {
      rememberIntent(intent); // for after signing in
      return;
    }
    if (intent?.kind === "bag") {
      add.mutate({
        variant_id: intent.preview.variant_id,
        quantity: 1,
        preview: intent.preview,
        announce: true,
      });
    } else if (intent?.kind === "save") {
      toggle(intent.productId, true, intent.name);
    }
    // Once per page arrival; the mutation and toggle are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, guest, pathname]);

  return null;
}
