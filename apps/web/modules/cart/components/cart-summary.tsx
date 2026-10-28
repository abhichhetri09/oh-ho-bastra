import type { Cart } from "@repo/types";
import { formatDiscount, formatPrice } from "@/lib/money";
import { freeShippingProgress } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { useShippingRule } from "@/providers/shipping-provider";

/**
 * How far the bag is from free shipping under the store's rule, as a
 * sentence and a bar; nothing when shipping is never free (or always is).
 * Pass the subtotal after any discount code: that's what the threshold
 * counts.
 */
export function FreeShippingProgress({ subtotal }: { subtotal: number }) {
  const progress = freeShippingProgress(subtotal, useShippingRule());
  if (!progress) return null;
  const { remaining, share } = progress;
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

/**
 * Subtotal, the discount code's line, shipping and the total, as the API
 * priced them (checkout charges the same).
 */
export function CartTotals({ cart }: { cart: Cart }) {
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatPrice(cart.subtotal)}</dd>
      </div>
      {cart.coupon && cart.discount > 0 && (
        <div className="flex justify-between gap-3">
          <dt className="min-w-0 truncate text-muted-foreground">
            Discount{" "}
            <span className="font-mono text-xs">({cart.coupon.code})</span>
          </dt>
          <dd className="text-success tabular-nums">
            {formatDiscount(cart.discount)}
          </dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Shipping</dt>
        <dd className="tabular-nums">
          {cart.item_count === 0
            ? "—"
            : cart.shipping === 0
              ? "Free"
              : formatPrice(cart.shipping)}
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-3 text-base">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatPrice(cart.total)}</dd>
      </div>
    </dl>
  );
}
