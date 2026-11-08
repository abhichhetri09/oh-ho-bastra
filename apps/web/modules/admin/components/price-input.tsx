"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "@phosphor-icons/react";
import type { AdminVariant } from "@repo/types";
import { adminSetVariantPrice } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";

/**
 * A variant's selling price, edited in place like StockInput: saved on
 * Enter or when the field loses focus, Escape puts the saved price back.
 * An offer must stay below it; the API's message says so when it doesn't.
 */
export function PriceInput({
  productId,
  variant,
  label,
}: {
  productId: string;
  variant: AdminVariant;
  label: string;
}) {
  const queryClient = useQueryClient();
  const saved = fromCents(variant.selling_price);
  const [draft, setDraft] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const value = draft ?? saved;
  const cents = toCents(value);
  const valid = cents !== null && cents > 0 && cents <= 100_000_000;

  const save = useAdminMutation({
    mutationFn: async (selling_price: number) => {
      const { data } = await adminSetVariantPrice({
        path: { productID: productId, variantID: variant.id },
        body: { selling_price },
        throwOnError: true,
      });
      return data.data;
    },
    failure: "Couldn't update the price.",
    invalidate: [
      adminKeys.variants(productId),
      adminKeys.products(),
      adminKeys.inventory(),
    ],
    onSuccess: (updated) => {
      // Show the saved price now, not after the refetch.
      queryClient.setQueryData<AdminVariant[]>(
        adminKeys.variants(productId),
        (list) =>
          list?.map((v) =>
            v.id === updated.id
              ? { ...v, selling_price: updated.selling_price }
              : v,
          ),
      );
      setDraft(null);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    },
  });

  function commit() {
    if (draft === null) return;
    if (!valid || cents === variant.selling_price) {
      setDraft(null);
      return;
    }
    save.mutate(cents, {
      // The toast shows the API's reason (an offer above it); start over.
      onError: (err) => {
        if (getApiError(err)?.errors?.length) setDraft(null);
      },
    });
  }

  return (
    <div className="relative inline-flex items-center justify-end">
      <span className="pointer-events-none absolute left-2 text-[0.8125rem] text-muted-foreground">
        €
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) =>
          setDraft(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(null);
          }
        }}
        disabled={save.isPending}
        aria-label={`Price for ${label}`}
        aria-invalid={!valid}
        className={cn(
          "h-8 w-24 border border-transparent bg-transparent pr-2 pl-5 text-right text-[0.8125rem] tabular-nums transition-colors outline-none hover:border-input focus:border-ring focus:bg-background disabled:opacity-60 aria-invalid:border-destructive",
        )}
      />
      <CheckIcon
        aria-hidden
        className={cn(
          "absolute -right-5 size-3.5 text-success transition-opacity duration-300",
          done ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
