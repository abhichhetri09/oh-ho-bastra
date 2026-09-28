import { Trash } from "@/components/icons";
import { LineItem } from "@/components/common/LineItem";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useCart } from "@/features/cart/cart-context";
import type { CartItem } from "@/features/cart/useCartItems";
import { formatPrice } from "@/lib/format";

export function CartLineItem({ item }: { item: CartItem }) {
  const { setQuantity, remove } = useCart();
  const { product, size, quantity, slug } = item;

  return (
    <LineItem
      title={product.name}
      href={`/products/${slug}`}
      image={product.images[0]?.url}
      swatch={product.swatch}
      size="lg"
      meta={`Size ${size} · ${formatPrice(item.unitPriceCents, product.currency)}`}
      className="items-start py-6 sm:gap-6"
    >
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* min 0: stepping below 1 removes the line. */}
        <QuantityStepper
          value={quantity}
          min={0}
          onChange={(next) => setQuantity(slug, size, next)}
        />
        <Button variant="ghost" className="text-muted-foreground" onClick={() => remove(slug, size)}>
          <Trash />
          Remove
        </Button>
      </div>
    </LineItem>
  );
}
