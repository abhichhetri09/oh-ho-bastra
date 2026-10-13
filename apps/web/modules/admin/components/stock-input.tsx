"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "@phosphor-icons/react";
import type { AdminVariant } from "@repo/types";
import { adminSetVariantStock } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";

/**
 * A variant's stock, edited in place: the count is saved on Enter or when
 * the field loses focus (an absolute value, so it is safe to resend).
 * Escape puts the saved count back. With `onSaved`, the inventory list is
 * left to the caller (it patches the row, so a sorted list doesn't jump).
 */
export function StockInput({
  productId,
  variantId,
  stock,
  label,
  onSaved,
}: {
  productId: string;
  variantId: string;
  stock: number;
  label: string;
  onSaved?: (stock: number) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const value = draft ?? String(stock);
  const parsed = Number(value);
  const valid = /^\d+$/.test(value) && parsed <= 10_000;

  const save = useAdminMutation({
    mutationFn: async (next: number) => {
      const { data } = await adminSetVariantStock({
        path: { productID: productId, variantID: variantId },
        body: { stock: next },
        throwOnError: true,
      });
      return data.data;
    },
    failure: "Couldn't update the stock.",
    invalidate: [
      adminKeys.variants(productId),
      adminKeys.products(),
      adminKeys.stats(),
      adminKeys.counts(),
      ...(onSaved ? [] : [adminKeys.inventory()]),
    ],
    onSuccess: (variant) => {
      // Show the saved count now, not after the refetch.
      queryClient.setQueryData<AdminVariant[]>(
        adminKeys.variants(productId),
        (list) =>
          list?.map((v) =>
            v.id === variant.id ? { ...v, stock: variant.stock } : v,
          ),
      );
      onSaved?.(variant.stock);
      setDraft(null);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    },
  });

  function commit() {
    if (draft === null) return;
    if (!valid) {
      setDraft(null);
      return;
    }
    if (parsed === stock) {
      setDraft(null);
      return;
    }
    save.mutate(parsed);
  }

  return (
    <div className="relative inline-flex items-center justify-end">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) =>
          setDraft(e.target.value.replace(/\D/g, "").slice(0, 5))
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
        aria-label={`Stock for ${label}`}
        aria-invalid={!valid}
        className={cn(
          "h-8 w-20 border border-transparent bg-transparent px-2 text-right text-[0.8125rem] tabular-nums transition-colors outline-none hover:border-input focus:border-ring focus:bg-background disabled:opacity-60 aria-invalid:border-destructive",
          stock === 0 && draft === null && "text-destructive",
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
