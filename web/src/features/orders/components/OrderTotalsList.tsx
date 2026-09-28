import { SummaryList } from "@/components/ui/summary-list";
import type { OrderTotals } from "@/features/orders/types";
import { formatPrice } from "@/lib/format";

export function OrderTotalsList({ totals }: { totals: OrderTotals }) {
  const price = (cents: number) => formatPrice(cents, totals.currency);
  return (
    <SummaryList
      rows={[
        { label: "Subtotal", value: price(totals.subtotalCents) },
        { label: "Shipping", value: price(totals.shippingCents) },
        { label: "Total", value: price(totals.totalCents), total: true },
        { label: "Of which VAT", value: price(totals.vatCents), note: true },
      ]}
    />
  );
}
