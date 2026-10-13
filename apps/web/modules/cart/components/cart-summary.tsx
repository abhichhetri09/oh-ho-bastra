import type { Cart } from "@repo/types";
import { formatPrice } from "@/lib/money";
import { FREE_SHIPPING_FROM, shippingFor } from "@/lib/shipping";
import { cn } from "@/lib/utils";

/** How far the bag is from free shipping, as a sentence and a bar. */
export function FreeShippingProgress({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(FREE_SHIPPING_FROM - subtotal, 0);
  const share = Math.min(subtotal / FREE_SHIPPING_FROM, 1);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {remaining === 0 ? (
          <span className="text-foreground">Your order ships free.</span>
        ) : (
          <>
            Add{" "}
            <span className="text-foreground tabular-nums">
              {formatPrice(remaining)}
            </span>{" "}
            for free shipping
          </>
        )}
      </p>
      <div className="h-px bg-border" aria-hidden>
        <div
          className={cn(
            "h-px transition-[width] duration-700 ease-out-expo",
            remaining === 0 ? "bg-success" : "bg-foreground",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Subtotal, shipping and the estimated total. */
export function CartTotals({ cart }: { cart: Cart }) {
  const shipping = shippingFor(cart.subtotal);
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatPrice(cart.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Shipping</dt>
        <dd className="tabular-nums">
          {cart.subtotal === 0
            ? "—"
            : shipping === 0
              ? "Free"
              : formatPrice(shipping)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-3 text-base">
        <dt>Total</dt>
        <dd className="tabular-nums">
          {formatPrice(cart.subtotal + shipping)}
        </dd>
      </div>
    </dl>
  );
}
