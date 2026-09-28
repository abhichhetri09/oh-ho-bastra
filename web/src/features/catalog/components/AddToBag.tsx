import { useState, type RefObject } from "react";

import { Bag, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useCart } from "@/features/cart/cart-context";
import { useFlyToBag } from "@/features/cart/fly-to-bag-context";
import type { Product } from "@/features/catalog/types";

export function AddToBag({
  product,
  size,
  flyFrom,
}: {
  product: Product;
  size: string | undefined;
  /** Element the photo animates out of. */
  flyFrom: RefObject<HTMLElement | null>;
}) {
  const { add } = useCart();
  const { fly } = useFlyToBag();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function onAdd() {
    if (!size) {
      return;
    }
    const origin = flyFrom.current?.getBoundingClientRect();
    if (origin) {
      fly(origin, { image: product.images[0]?.url, swatch: product.swatch });
    }
    add(product.slug, quantity, size);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <QuantityStepper value={quantity} onChange={setQuantity} />
      <Button size="lg" onClick={onAdd} disabled={!size}>
        {added ? <Check /> : <Bag />}
        {!size ? "Sold out" : added ? "Added to bag" : "Add to bag"}
      </Button>
    </div>
  );
}
