import { LineItem } from "@/components/common/LineItem";
import type { OrderLine } from "@/features/orders/types";
import { formatPrice } from "@/lib/format";

export function OrderLines({
  items,
  currency,
  showSku = false,
}: {
  items: OrderLine[];
  currency: string;
  showSku?: boolean;
}) {
  return (
    <ul className="divide-y border-y">
      {items.map((item) => (
        <LineItem
          key={item.sku}
          title={item.productName}
          href={`/products/${item.productSlug}`}
          image={item.imageUrl}
          swatch={item.swatch}
          className="py-5"
          meta={
            <>
              {showSku ? `${item.sku} · ` : ""}Size {item.size} · {item.quantity} ×{" "}
              {formatPrice(item.unitPriceCents, currency)}
            </>
          }
          trailing={formatPrice(item.unitPriceCents * item.quantity, currency)}
        />
      ))}
    </ul>
  );
}
