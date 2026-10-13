import Image from "next/image";
import Link from "next/link";
import type { ProductWithPrice } from "@repo/types";
import { percentOff } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Stars } from "@/modules/reviews/components/stars";
import { WishlistButton } from "@/modules/wishlist/components/wishlist-button";
import { Price } from "./price";

export const CARD_SIZES =
  "(min-width: 1280px) 22vw, (min-width: 768px) 31vw, 47vw";

/**
 * A product tile: a 4:5 image that eases in and, when the product has a
 * second photo, crossfades to it on hover, with a save heart on top (a
 * sibling of the link: a button can't sit inside one). Works in server and
 * client trees.
 */
export function ProductCard({
  product,
  eager = false,
  index = 0,
  className,
}: {
  product: ProductWithPrice;
  /** Above the fold: load now instead of lazily. */
  eager?: boolean;
  /** Position in its grid, for the staggered entrance. */
  index?: number;
  className?: string;
}) {
  const [image, hover] = product.images;
  const onOffer =
    product.offer_price !== null && product.offer_price < product.selling_price;
  const soldOut = !product.in_stock;

  return (
    <div
      className={cn("group animate-rise relative", className)}
      style={{ "--i": index } as React.CSSProperties}
    >
      <Link
        href={`/products/${product.slug}`}
        className="group/link flex flex-col gap-3.5 outline-none"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-surface ring-ring/40 ring-offset-2 ring-offset-background group-focus-visible/link:ring-2">
          {image && (
            <Image
              src={image}
              alt={product.name}
              fill
              // Eager + high priority (not preload): the browser picks the
              // srcset candidate itself, so a preload hint could miss it.
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "auto"}
              sizes={CARD_SIZES}
              className={cn(
                "object-cover transition-[transform,opacity] duration-[1200ms] ease-out-expo group-hover:scale-[1.035]",
                hover && "group-hover:opacity-0",
                // Still browsable, but plainly not for sale right now.
                soldOut && "opacity-60 grayscale-[0.4]",
              )}
            />
          )}
          {hover && (
            <Image
              src={hover}
              alt=""
              fill
              loading="lazy"
              sizes={CARD_SIZES}
              className="scale-[1.06] object-cover opacity-0 transition-[transform,opacity] duration-[1200ms] ease-out-expo group-hover:scale-100 group-hover:opacity-100"
            />
          )}
          {soldOut ? (
            <span className="absolute top-3 left-3 rounded-control bg-foreground px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-background uppercase">
              Sold out
            </span>
          ) : onOffer && product.offer_price !== null ? (
            <span className="absolute top-3 left-3 rounded-control bg-clay px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] text-clay-foreground uppercase">
              −{percentOff(product.selling_price, product.offer_price)}%
            </span>
          ) : product.is_featured ? (
            <span className="absolute top-3 left-3 rounded-control bg-background/85 px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] uppercase backdrop-blur">
              Editor&apos;s pick
            </span>
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-3 text-[0.8125rem] leading-snug">
          <div className="min-w-0 space-y-1.5">
            <h3 className="link-underline line-clamp-2 self-start">
              {product.name}
            </h3>
            {product.rating_count > 0 && (
              <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground tabular-nums">
                <Stars value={product.rating_avg} size="size-3" />
                <span>({product.rating_count})</span>
              </p>
            )}
          </div>
          <Price
            price={product.price}
            selling={product.selling_price}
            offer={product.offer_price}
            className="shrink-0 flex-col items-end gap-0 text-right"
          />
        </div>
      </Link>
      <WishlistButton
        productId={product.id}
        name={product.name}
        className="absolute top-3 right-3"
      />
    </div>
  );
}
