"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  ArrowCounterClockwiseIcon,
  PackageIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { ProductDetail, StorefrontVariant } from "@repo/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EASE_OUT } from "@/lib/motion";
import { shippingPerk } from "@/lib/shipping";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { AddToBag } from "@/modules/cart/components/add-to-bag";
import { productPreview } from "@/modules/cart/lib/cart-math";
import { Stars } from "@/modules/reviews/components/stars";
import { WishlistButton } from "@/modules/wishlist/components/wishlist-button";
import { useShippingRule } from "@/providers/shipping-provider";
import { optionGroups, pickOption, selectionOf } from "../lib/variants";
import { Price } from "./price";
import { ProductGallery } from "./product-gallery";
import { StickyBuyBar } from "./sticky-buy-bar";
import { VariantSelector } from "./variant-selector";

// Dates render on the server and the client: pin the zone so they match.
const offerDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * The product page body: gallery and a sticky buy column. The selected
 * variant drives price, stock and photos, and is mirrored to ?variant= so a
 * link opens on the same choice.
 */
export function ProductView({
  product,
  variants,
  initialVariantId,
  categoryName,
  breadcrumbs,
}: {
  product: ProductDetail;
  variants: StorefrontVariant[];
  initialVariantId: string;
  categoryName?: string;
  breadcrumbs?: React.ReactNode;
}) {
  const [variantId, setVariantId] = useState(initialVariantId);
  const variant = variants.find((v) => v.id === variantId);
  const shipping = useShippingRule();

  const images = [
    ...new Set([
      ...(variant?.images ?? product.variant_images),
      ...product.images,
    ]),
  ];
  const price = variant?.price ?? product.price;
  const selling = variant?.selling_price ?? product.selling_price;
  const offer = variant ? variant.offer_price : product.offer_price;
  const stock = variant?.stock ?? product.stock;
  const groups = optionGroups(variants);
  const preview = productPreview(product, variant);
  // The page's own buy button; the phone bar shows once it scrolls away.
  const buyRow = useRef<HTMLDivElement>(null);
  const selection = variant ? selectionOf(variant) : {};

  function choose(name: string, value: string) {
    const next = pickOption(variants, selection, name, value);
    if (!next || next.id === variantId) return;
    setVariantId(next.id);
    const url = new URL(window.location.href);
    if (next.is_default) url.searchParams.delete("variant");
    else url.searchParams.set("variant", next.id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
      <ProductGallery images={images} alt={product.name} />

      <div className="space-y-9 lg:sticky lg:top-24 lg:self-start lg:pt-2">
        <div className="space-y-5">
          {breadcrumbs}
          <div className="space-y-4">
            {categoryName && (
              <p className="eyebrow animate-rise">{categoryName}</p>
            )}
            <h1
              className="display animate-rise text-5xl sm:text-6xl"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {product.name}
            </h1>
            <div className="flex min-h-8 items-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.div
                  key={`${price}-${selling}`}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE_OUT }}
                >
                  <Price
                    price={price}
                    selling={selling}
                    offer={offer}
                    showSaving
                    className="text-xl"
                  />
                </m.div>
              </AnimatePresence>
            </div>
            {product.rating_count > 0 && (
              <a
                href="#reviews"
                className="flex w-fit items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Stars value={product.rating_avg} />
                <span className="tabular-nums">
                  {product.rating_avg.toFixed(1)} · {product.rating_count}{" "}
                  {product.rating_count === 1 ? "review" : "reviews"}
                </span>
              </a>
            )}
            {offer !== null && variant?.offer_expires_at && (
              <p className="text-xs text-clay">
                Offer ends{" "}
                {offerDate.format(new Date(variant.offer_expires_at))}
              </p>
            )}
          </div>
        </div>

        {groups.length > 0 && (
          <VariantSelector
            groups={groups}
            variants={variants}
            selection={selection}
            onChoose={choose}
          />
        )}

        <div className="space-y-4">
          <div ref={buyRow} className="flex gap-2">
            <AddToBag preview={preview} stock={stock} />
            <WishlistButton
              productId={product.id}
              name={product.name}
              variant="outline"
            />
          </div>
          <StockLine stock={stock} />
        </div>

        <ul className="grid gap-3 border-y border-border py-6 text-[0.8125rem] sm:grid-cols-2">
          <li className="flex items-center gap-3">
            <PackageIcon
              className="size-5 shrink-0 text-muted-foreground"
              weight="light"
            />
            {shippingPerk(shipping)}
          </li>
          <li className="flex items-center gap-3">
            <ArrowCounterClockwiseIcon
              className="size-5 shrink-0 text-muted-foreground"
              weight="light"
            />
            Free 30-day returns
          </li>
          <li className="flex items-center gap-3 sm:col-span-2">
            <ShieldCheckIcon
              className="size-5 shrink-0 text-muted-foreground"
              weight="light"
            />
            Secure checkout with Stripe
          </li>
        </ul>

        <Accordion multiple defaultValue={["details"]}>
          {product.description && (
            <AccordionItem value="details">
              <AccordionTrigger className="eyebrow !text-foreground py-5 hover:no-underline">
                Details
              </AccordionTrigger>
              <AccordionContent>
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </AccordionContent>
            </AccordionItem>
          )}
          {product.features.length > 0 && (
            <AccordionItem value="features">
              <AccordionTrigger className="eyebrow !text-foreground py-5 hover:no-underline">
                Materials &amp; care
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {product.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-2 h-px w-3 shrink-0 bg-foreground/40"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="shipping">
            <AccordionTrigger className="eyebrow !text-foreground py-5 hover:no-underline">
              Shipping &amp; returns
            </AccordionTrigger>
            <AccordionContent>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {site.shippingCopy(shipping)}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <StickyBuyBar
        anchor={buyRow}
        preview={preview}
        stock={stock}
        price={price}
        selling={selling}
        offer={offer}
      />
    </div>
  );
}

function StockLine({ stock }: { stock: number }) {
  const low = stock > 0 && stock <= 5;
  return (
    <p
      className="flex items-center gap-2.5 text-[0.8125rem]"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {low && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-clay opacity-60 motion-reduce:animate-none" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            stock === 0
              ? "bg-muted-foreground"
              : low
                ? "bg-clay"
                : "bg-success",
          )}
        />
      </span>
      {stock === 0
        ? "Sold out"
        : low
          ? `Only ${stock} left`
          : "In stock, ready to ship"}
    </p>
  );
}
