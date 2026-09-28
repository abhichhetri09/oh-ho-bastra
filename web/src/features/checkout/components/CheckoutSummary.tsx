import { Link } from "react-router-dom";

import { LineItem } from "@/components/common/LineItem";
import { SummaryPanel } from "@/components/common/SummaryPanel";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SummaryList } from "@/components/ui/summary-list";
import type { CartItem } from "@/features/cart/useCartItems";
import { formatNumber, formatPrice } from "@/lib/format";

export function CheckoutSummary({
  items,
  subtotalCents,
  shippingCents,
  vatRate,
  error,
  submitting,
}: {
  items: CartItem[];
  subtotalCents: number;
  shippingCents: number | undefined;
  vatRate: number;
  error: string | null;
  submitting: boolean;
}) {
  return (
    <SummaryPanel>
      <ul className="space-y-4">
        {items.map((item) => (
          <LineItem
            key={`${item.slug}-${item.size}`}
            size="sm"
            title={item.product.name}
            image={item.product.images[0]?.url}
            swatch={item.product.swatch}
            meta={`${item.size} · × ${item.quantity}`}
            trailing={formatPrice(item.unitPriceCents * item.quantity)}
          />
        ))}
      </ul>
      <div className="border-t pt-4">
        <SummaryList
          rows={[
            { label: "Subtotal", value: formatPrice(subtotalCents) },
            { label: "Shipping", value: shippingCents === undefined ? "—" : formatPrice(shippingCents) },
            { label: "Total", value: formatPrice(subtotalCents + (shippingCents ?? 0)), total: true },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Includes VAT {formatNumber(vatRate)} %
        </p>
      </div>
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={submitting}>
          <ArrowRight />
          {submitting ? "Placing order…" : "Continue to payment"}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/cart">Back to bag</Link>
        </Button>
      </div>
    </SummaryPanel>
  );
}
