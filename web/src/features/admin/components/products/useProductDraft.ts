import { useState } from "react";

import { useSetStock, useUpdateProduct } from "@/features/admin/api";
import { centsToInput, parseEuros } from "@/features/admin/price-input";
import type { AdminProduct } from "@/features/admin/types";

type Draft = { price?: string; active?: boolean; stock?: Record<string, string> };

/** Unsaved edits for one product row, what changed, and a save that sends only the changes. */
export function useProductDraft(product: AdminProduct) {
  const [draft, setDraft] = useState<Draft>({});
  const updateProduct = useUpdateProduct();
  const setStock = useSetStock();

  const price = draft.price ?? centsToInput(product.priceCents);
  const priceCents = parseEuros(price);
  const active = draft.active ?? product.active;
  const stockInput = (sku: string, current: number) => draft.stock?.[sku] ?? String(current);

  const stockInvalid = product.variants.some((v) => {
    const raw = draft.stock?.[v.sku];
    return raw !== undefined && !/^\d+$/.test(raw.trim());
  });
  const stockChanges = stockInvalid
    ? []
    : product.variants.flatMap((v) => {
        const raw = draft.stock?.[v.sku];
        return raw !== undefined && Number(raw) !== v.stock ? [{ sku: v.sku, stock: Number(raw) }] : [];
      });
  const productChanged =
    (priceCents !== null && priceCents !== product.priceCents) || active !== product.active;

  async function save() {
    if (priceCents === null || stockInvalid) return;
    try {
      if (productChanged) {
        await updateProduct.mutateAsync({ slug: product.slug, priceCents, active });
      }
      for (const change of stockChanges) {
        await setStock.mutateAsync(change);
      }
      setDraft({});
    } catch {
      // Surfaced through `error`.
    }
  }

  return {
    price,
    priceInvalid: priceCents === null,
    active,
    stockInput,
    setPrice: (value: string) => setDraft((d) => ({ ...d, price: value })),
    setActive: (value: boolean) => setDraft((d) => ({ ...d, active: value })),
    setStock: (sku: string, value: string) =>
      setDraft((d) => ({ ...d, stock: { ...d.stock, [sku]: value } })),
    isEdited: (sku: string) => draft.stock?.[sku] !== undefined,
    reset: () => setDraft({}),
    save,
    dirty: productChanged || stockChanges.length > 0,
    invalid: priceCents === null || stockInvalid,
    saving: updateProduct.isPending || setStock.isPending,
    error: updateProduct.error ?? setStock.error,
  };
}
