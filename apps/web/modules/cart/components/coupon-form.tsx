"use client";

import { useState } from "react";
import { TagIcon, XIcon } from "@phosphor-icons/react";
import type { Cart } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiError } from "@/lib/api/errors";
import { formatPriceShort } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCartMutations } from "../hooks/use-cart-mutations";
import { couponSummary } from "../lib/coupon";

/**
 * The bag's discount code: a field to apply one, or the applied code with
 * a way to remove it. A code that stopped applying (the bag dropped below
 * its minimum, it expired) stays, with the reason, until it's removed or
 * the bag is fixed; checkout refuses it until then.
 */
export function CouponForm({
  cart,
  className,
}: {
  cart: Cart;
  className?: string;
}) {
  const { applyCode, removeCode } = useCartMutations();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const coupon = cart.coupon;

  if (coupon) {
    const summary = couponSummary(coupon, formatPriceShort);
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "inline-flex h-7 min-w-0 items-center gap-1.5 border pr-1 pl-2 font-mono text-[0.6875rem] tracking-[0.12em] uppercase",
              coupon.issue
                ? "border-clay/40 text-clay"
                : "border-border text-foreground",
            )}
          >
            <TagIcon className="size-3.5 shrink-0" weight="light" />
            <span className="truncate">{coupon.code}</span>
            <button
              type="button"
              onClick={() => removeCode.mutate()}
              disabled={removeCode.isPending}
              aria-label={`Remove code ${coupon.code}`}
              className="flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <XIcon className="size-3" />
            </button>
          </span>
          {summary && !coupon.issue && (
            <span className="text-xs text-muted-foreground">{summary}</span>
          )}
        </div>
        {coupon.issue && (
          <p className="text-xs text-clay" role="status">
            {coupon.issue.message}. Remove it or update your bag to check out.
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "link-underline self-start text-xs text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        Have a discount code?
      </button>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (!value) {
      setError("Enter a code");
      return;
    }
    applyCode.mutate(value, {
      onSuccess: () => {
        setCode("");
        setError("");
        setOpen(false);
      },
      onError: (err) =>
        setError(
          getApiError(err)?.message ?? "Couldn't apply the code. Try again.",
        ),
    });
  }

  return (
    <form onSubmit={submit} noValidate className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <label htmlFor="coupon-code" className="sr-only">
          Discount code
        </label>
        <Input
          id="coupon-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError("");
          }}
          placeholder="Discount code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "coupon-code-error" : undefined}
          className="h-9 font-mono uppercase placeholder:font-sans placeholder:normal-case"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-9 shrink-0"
          disabled={applyCode.isPending}
        >
          {applyCode.isPending ? "Applying…" : "Apply"}
        </Button>
      </div>
      {error && (
        <p
          id="coupon-code-error"
          className="animate-rise text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
