import { Input } from "@/components/ui/input";
import type { AdminProduct } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import type { useProductDraft } from "./useProductDraft";

export function StockInputs({
  product,
  draft,
}: {
  product: AdminProduct;
  draft: ReturnType<typeof useProductDraft>;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Stock by size</legend>
      <div className="grid grid-cols-4 gap-2">
        {product.variants.map((variant) => (
          <label key={variant.sku} className="space-y-1">
            <span className="block text-xs text-muted-foreground">{variant.size}</span>
            <Input
              inputMode="numeric"
              value={draft.stockInput(variant.sku, variant.stock)}
              onChange={(event) => draft.setStock(variant.sku, event.target.value)}
              aria-label={`${product.name}, size ${variant.size}, stock`}
              className={cn(
                "tabular-nums",
                variant.stock === 0 && !draft.isEdited(variant.sku) && "border-destructive/60",
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
