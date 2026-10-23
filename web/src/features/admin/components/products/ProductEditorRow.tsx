import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { AdminProduct } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { StockInputs } from "./StockInputs";
import { useProductDraft } from "./useProductDraft";

export function ProductEditorRow({ product }: { product: AdminProduct }) {
  const draft = useProductDraft(product);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void draft.save();
      }}
      className={cn(
        "grid gap-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_8rem_minmax(0,1.6fr)_auto] lg:items-end",
        !draft.active && "opacity-70",
      )}
    >
      <div className="flex items-center gap-4">
        <ProductImage src={product.imageUrl} alt={product.name} swatch={product.swatch} className="h-16 w-13 shrink-0 rounded-md" />
        <div className="min-w-0">
          <Link to={`/admin/products/${product.slug}`} className="font-medium underline-offset-4 hover:underline">
            {product.name}
          </Link>
          <p className="text-sm text-muted-foreground">{product.collection}</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => draft.setActive(event.target.checked)}
              className="accent-foreground"
            />
            Visible in shop
          </label>
        </div>
      </div>

      {product.variants.some((v) => v.priceCents !== null && v.priceCents !== product.priceCents) ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Price</p>
          <Link to={`/admin/products/${product.slug}`} className="block text-muted-foreground underline-offset-4 hover:underline">
            Per size — edit
          </Link>
        </div>
      ) : (
        <FormField
          id={`${product.slug}-price`}
          label="Price (€)"
          inputMode="decimal"
          value={draft.price}
          onChange={(event) => draft.setPrice(event.target.value)}
          aria-invalid={draft.priceInvalid}
          className={cn("[&_input]:tabular-nums", draft.priceInvalid && "[&_input]:border-destructive")}
        />
      )}

      <StockInputs product={product} draft={draft} />

      <div className="flex items-center gap-2">
        {draft.dirty ? (
          <Button type="button" variant="ghost" onClick={draft.reset} disabled={draft.saving}>
            Reset
          </Button>
        ) : null}
        <Button type="submit" disabled={!draft.dirty || draft.saving || draft.invalid}>
          {draft.saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {draft.error ? (
        <p className="text-sm text-destructive lg:col-span-4" role="alert">
          {draft.error.message}
        </p>
      ) : null}
    </form>
  );
}
