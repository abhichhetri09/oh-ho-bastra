import {
  CheckCircleIcon,
  InfoIcon,
  TruckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import type { Cart } from "@repo/types";
import { formatDiscount, formatPrice } from "@/lib/money";
import { referralNotice } from "@/lib/referrals";
import { freeShippingProgress } from "@/lib/shipping";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useShippingRule } from "@/providers/shipping-provider";

/**
 * How far the bag is from free shipping under the store's rule, as a
 * nudge and a bar: "Add 2 more items or €41.00 more for free shipping".
 * Nothing when shipping is never free (or always is). Pass the subtotal
 * after any discount code: that's what the threshold counts.
 */
export function FreeShippingProgress({
  subtotal,
  items,
}: {
  subtotal: number;
  items: number;
}) {
  const progress = freeShippingProgress(subtotal, items, useShippingRule());
  if (!progress) return null;
  const { free, remaining, itemsLeft, share } = progress;
  return (
    <div
      className={cn(
        "space-y-3 rounded-panel border px-4 py-3.5 transition-colors",
        free
          ? "border-success/30 bg-success/5"
          : "border-border bg-secondary/50",
      )}
    >
      <p
        className="flex items-start gap-3 text-[0.8125rem] leading-snug"
        aria-live="polite"
      >
        <TruckIcon
          weight={free ? "fill" : "regular"}
          className={cn(
            "mt-0.5 size-4 shrink-0",
            free ? "text-success" : "text-foreground",
          )}
        />
        {free ? (
          <span>
            <strong className="font-medium">
              You&apos;ve unlocked free shipping.
            </strong>{" "}
            <span className="text-muted-foreground">Nice one.</span>
          </span>
        ) : (
          <span>
            {itemsLeft !== null && (
              <>
                Add{" "}
                <strong className="font-medium tabular-nums">
                  {itemsLeft} more {itemsLeft === 1 ? "item" : "items"}
                </strong>
              </>
            )}
            {itemsLeft !== null && remaining !== null && " or spend "}
            {itemsLeft === null && remaining !== null && "Spend "}
            {remaining !== null && (
              <strong className="font-medium tabular-nums">
                {formatPrice(remaining)} more
              </strong>
            )}{" "}
            for <strong className="font-medium">free shipping</strong>.
          </span>
        )}
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-border" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out-expo",
            free ? "bg-success" : "bg-foreground",
          )}
          style={{ width: `${Math.max(share, 0.04) * 100}%` }}
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
    <>
      <ReferralNoticeLine cart={cart} />
      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">
            <Amount value={formatPrice(cart.subtotal)} />
          </dd>
        </div>
        {cart.referral?.applied && cart.discount > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="min-w-0 truncate text-muted-foreground">
              Friend&apos;s discount
            </dt>
            <dd className="text-success tabular-nums">
              {formatDiscount(cart.discount)}
            </dd>
          </div>
        ) : (
          cart.coupon &&
          cart.discount > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="min-w-0 truncate text-muted-foreground">
                Discount{" "}
                <span className="font-mono text-xs">({cart.coupon.code})</span>
              </dt>
              <dd className="text-success tabular-nums">
                {formatDiscount(cart.discount)}
              </dd>
            </div>
          )
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="tabular-nums">
            <Amount
              value={
                cart.item_count === 0
                  ? "—"
                  : cart.shipping === 0
                    ? "Free"
                    : formatPrice(cart.shipping)
              }
            />
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-3 text-base">
          <dt>Total</dt>
          <dd className="tabular-nums">
            <Amount value={formatPrice(cart.total)} />
          </dd>
        </div>
      </dl>
    </>
  );
}

const NOTICE = {
  applied: {
    Icon: CheckCircleIcon,
    tone: "border-success/40 text-success",
  },
  issue: { Icon: WarningCircleIcon, tone: "border-clay/40 text-clay" },
  outdone: { Icon: InfoIcon, tone: "border-border text-muted-foreground" },
};

/**
 * Whether the friend's referral on the bag is its discount, and why not
 * when it isn't, by the discount line.
 */
function ReferralNoticeLine({ cart }: { cart: Cart }) {
  const notice = referralNotice(cart.referral);
  if (!notice) return null;
  const { Icon, tone } = NOTICE[notice.tone];
  return (
    <p
      role="status"
      className={cn(
        "mb-3 flex items-start gap-2 rounded-control border px-3 py-2 text-xs",
        tone,
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" weight="bold" />
      <span>
        {notice.message}
        {notice.tone === "issue" && "."}
      </span>
    </p>
  );
}

/** An amount that rolls to its new value when it changes. */
function Amount({ value }: { value: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={value}
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="inline-block"
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
