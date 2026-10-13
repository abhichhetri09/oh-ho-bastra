"use client";

import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowCounterClockwiseIcon,
  LockSimpleIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { unitCount } from "../lib/cart-math";
import { useCart } from "../queries";
import { CartLine } from "./cart-line";
import { CartTotals, FreeShippingProgress } from "./cart-summary";

/**
 * The /cart page: lines on the left, a sticky summary on the right. The
 * server seeds the cart when it can read it; otherwise the page waits for
 * hydration before showing what the browser fetched.
 */
export function CartView({ seeded }: { seeded: boolean }) {
  const hydrated = useHydrated();
  useCancelledCheckoutNotice();
  const query = useCart();
  const ready = seeded || hydrated;
  const cart = ready ? query.data : undefined;
  const isPending = !cart && (!ready || query.isPending);
  const isError = ready && query.isError;
  const { refetch } = query;

  return (
    <div className="container-page pt-8 pb-24 sm:pt-14">
      <header className="mb-10 flex items-baseline gap-4 border-b border-border pb-6">
        <h1 className="display animate-rise text-[clamp(3rem,6vw,5rem)]">
          Your bag.
        </h1>
        {cart && cart.items.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {unitCount(cart)} {unitCount(cart) === 1 ? "item" : "items"}
          </span>
        )}
      </header>

      {isPending ? (
        <div className="grid gap-12 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-[7rem_1fr] gap-4">
                <Skeleton className="aspect-[4/5]" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : isError && !cart ? (
        <EmptyState
          eyebrow="Something went wrong"
          title="We couldn't load your bag."
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : !cart || cart.items.length === 0 ? (
        <EmptyState
          eyebrow="Nothing here yet"
          title="Your bag is empty."
          action={
            <Link href="/shop" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        >
          Pieces you add are saved to your account until you&apos;re ready.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16">
          <ul className="divide-y divide-border border-y border-border">
            {cart.items.map((line, i) => (
              <CartLine
                key={line.variant_id}
                line={line}
                size="large"
                eager={i === 0}
              />
            ))}
          </ul>

          <aside
            aria-label="Order summary"
            className="space-y-6 rounded-panel border border-border bg-surface/60 p-6 lg:sticky lg:top-24"
          >
            <p className="eyebrow">Summary</p>
            <FreeShippingProgress subtotal={cart.subtotal} />
            <CartTotals cart={cart} />
            {cart.has_issues && (
              <p className="text-xs text-clay">
                Some items need your attention: change or remove them to check
                out.
              </p>
            )}
            {cart.has_issues ? (
              <Button size="lg" className="w-full" disabled>
                <LockSimpleIcon />
                Checkout
              </Button>
            ) : (
              <Link
                href="/checkout"
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
              >
                <LockSimpleIcon />
                Checkout
              </Link>
            )}
            <ul className="space-y-2.5 border-t border-border pt-5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2.5">
                <PackageIcon className="size-4" weight="light" />
                Ships in 2–4 working days
              </li>
              <li className="flex items-center gap-2.5">
                <ArrowCounterClockwiseIcon className="size-4" weight="light" />
                Free 30-day returns
              </li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Stripe's cancel link lands on /cart?checkout=cancelled: say so once and
 * drop the parameter so a reload doesn't repeat it.
 */
function useCancelledCheckoutNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "cancelled") return;
    toast("Checkout cancelled. Your bag is just as you left it.");
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url);
  }, []);
}
