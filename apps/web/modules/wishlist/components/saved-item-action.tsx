"use client";

import Link from "next/link";
import { HandbagIcon } from "@phosphor-icons/react";
import type { WishlistProduct } from "@repo/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCartMutations } from "@/modules/cart/hooks/use-cart-mutations";
import { savedPreview } from "@/modules/cart/lib/cart-math";

/**
 * What a saved product offers: one tap into the bag when there is only
 * one way to buy it, otherwise a link to choose the size or colour (a
 * wishlist saves the product, not a variant), or "Sold out".
 */
export function SavedItemAction({
  product,
  onNavigate,
  className,
}: {
  product: WishlistProduct;
  /** Called before leaving for the product page (a drawer closes). */
  onNavigate?: () => void;
  className?: string;
}) {
  const { add } = useCartMutations();

  if (!product.in_stock) {
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        Sold out
      </Button>
    );
  }

  if (product.variant_count > 1) {
    return (
      <Link
        href={`/products/${product.slug}`}
        onClick={onNavigate}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          className,
        )}
      >
        Choose options
      </Link>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      // In the bag at once; the toast's "View bag" opens it (and closes
      // the wishlist drawer), a refusal rolls back with its reason.
      onClick={() =>
        add.mutate({
          variant_id: product.variant_id,
          quantity: 1,
          preview: savedPreview(product),
          announce: true,
        })
      }
    >
      <HandbagIcon />
      Add to bag
    </Button>
  );
}
