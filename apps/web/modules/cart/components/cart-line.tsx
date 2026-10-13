"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CartLine as Line } from "@repo/types";
import { cn } from "@/lib/utils";
import { Price } from "@/modules/catalog/components/price";
import { useCartMutations } from "../hooks/use-cart-mutations";
import { optionSummary } from "../lib/cart-math";
import { QuantityStepper } from "./quantity-stepper";

/** How long the stepper waits for more clicks before saving. */
const SAVE_DELAY = 350;

/**
 * One bag line: photo, name, options, price, a quantity stepper and remove.
 * Stepper clicks show at once and save as one change once they stop.
 * Lines that went short or off sale say so and offer the fix.
 */
export function CartLine({
  line,
  onNavigate,
  size = "compact",
  eager = false,
}: {
  line: Line;
  /** Called when a link inside is followed (the drawer closes). */
  onNavigate?: () => void;
  size?: "compact" | "large";
  /** Above the fold on a page (the /cart page's first line). */
  eager?: boolean;
}) {
  const { update, remove } = useCartMutations();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? line.quantity;
  const href = `/products/${line.product_slug}?variant=${line.variant_id}`;
  const short = line.available && line.quantity > line.stock;

  const { mutate: save } = update;
  const variantId = line.variant_id;

  const max = Math.max(line.max_quantity, line.quantity);

  // Steps add up on the latest draft; landing back on the saved quantity
  // cancels the pending save.
  function step(delta: 1 | -1) {
    setDraft((prev) => {
      const next = Math.min(Math.max((prev ?? line.quantity) + delta, 1), max);
      return next === line.quantity ? null : next;
    });
  }

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => {
      save({ variantId, quantity: draft }, { onSettled: () => setDraft(null) });
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, save, variantId]);

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] gap-4 py-5",
        !line.available && "opacity-70",
      )}
    >
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "relative block aspect-[4/5] overflow-hidden rounded-media bg-surface",
          size === "large" ? "w-24 sm:w-28" : "w-20",
        )}
        tabIndex={-1}
        aria-hidden
      >
        {line.image && (
          <Image
            src={line.image}
            alt=""
            fill
            sizes={size === "large" ? "112px" : "80px"}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="object-cover"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={href}
              onClick={onNavigate}
              className="link-underline line-clamp-2 text-sm"
            >
              {line.product_name}
            </Link>
            {line.options.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {optionSummary(line)}
              </p>
            )}
          </div>
          <Price
            price={line.price * shown}
            selling={line.selling_price * shown}
            offer={line.offer_price === null ? null : line.offer_price * shown}
            className="shrink-0 justify-end text-[0.8125rem]"
          />
        </div>

        {!line.available ? (
          <p className="text-xs text-destructive">No longer available</p>
        ) : short ? (
          <p className="text-xs text-clay">
            {line.stock === 0
              ? "Sold out since you added it"
              : `Only ${line.stock} left`}
            {line.stock > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  // A taller hit area than the text, without moving it.
                  className="-my-2 py-2 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      variantId: line.variant_id,
                      quantity: line.stock,
                    })
                  }
                >
                  Change to {line.stock}
                </button>
              </>
            )}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          {line.available && line.stock > 0 ? (
            <QuantityStepper
              value={shown}
              max={max}
              onStep={step}
              label={line.product_name}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => remove.mutate(line)}
            className="link-underline -my-3 py-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Remove
            <span className="sr-only"> {line.product_name}</span>
          </button>
        </div>
      </div>
    </li>
  );
}
