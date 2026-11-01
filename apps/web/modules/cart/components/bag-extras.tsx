"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { CheckIcon, PlusIcon, SpinnerIcon, XIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ProductWithPrice, StorefrontVariant } from "@repo/types";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/lib/api/client";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { catalogKeys } from "@/modules/catalog/keys";
import { Price } from "@/modules/catalog/components/price";
import { optionLabel } from "@/modules/catalog/lib/option-order";
import { quickAddPlan, type QuickChoice } from "@/modules/catalog/lib/variants";
import { fetchProductVariants } from "@/modules/catalog/queries";
import { useCartMutations } from "../hooks/use-cart-mutations";
import { productPreview } from "../lib/cart-math";
import { flyToBag } from "../lib/fly-to-bag";

const PICKS = 4;

/**
 * Editor's picks (else the newest products), for the bag's "You may also
 * like". Shared by the drawer and the bag page, and cached for a while:
 * it doesn't need to be fresher than that.
 */
function usePicks() {
  return useQuery({
    queryKey: [...catalogKeys.all, "bag-picks"],
    queryFn: async ({ signal }) => {
      const featured = await listProducts({
        query: { featured: true },
        signal,
        throwOnError: true,
      });
      if (featured.data.data.products.length >= 2)
        return featured.data.data.products;
      const newest = await listProducts({ signal, throwOnError: true });
      return newest.data.data.products;
    },
    staleTime: 5 * 60_000,
  });
}

/** How long an added pick shows its tick before leaving the rail. */
const ADDED_FOR = 900;

/**
 * A few products the shopper might add, leaving out what's already in the
 * bag and anything sold out. Each opens its product page, or goes straight
 * into the bag from its + (asking for a size first when there's a choice).
 */
export function YouMayAlsoLike({
  inBag,
  onNavigate,
  className,
}: {
  /** Product IDs already in the bag. */
  inBag: string[];
  onNavigate?: () => void;
  className?: string;
}) {
  const picks = usePicks();
  // Just added: kept a moment so the tick shows before the card leaves.
  const [held, setHeld] = useState<string[]>([]);
  const products = (picks.data ?? [])
    .filter((p) => p.in_stock && (!inBag.includes(p.id) || held.includes(p.id)))
    .slice(0, PICKS);
  if (products.length === 0) return null;

  function hold(id: string) {
    setHeld((ids) => [...ids, id]);
    setTimeout(() => setHeld((ids) => ids.filter((x) => x !== id)), ADDED_FOR);
  }

  return (
    <section className={cn("space-y-3", className)}>
      <p className="eyebrow">You may also like</p>
      <ul className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5">
        <AnimatePresence initial={false}>
          {products.map((product) => (
            <PickCard
              key={product.id}
              product={product}
              onAdded={() => hold(product.id)}
              onNavigate={onNavigate}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

type QuickState = "idle" | "loading" | "choosing" | "added";

function PickCard({
  product,
  onAdded,
  onNavigate,
}: {
  product: ProductWithPrice;
  onAdded: () => void;
  onNavigate?: () => void;
}) {
  const href = `/products/${product.slug}`;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { add } = useCartMutations();
  const [state, setState] = useState<QuickState>("idle");
  const [choice, setChoice] = useState<{
    name: string;
    options: QuickChoice[];
  }>();
  const plus = useRef<HTMLButtonElement>(null);

  function addVariant(variant: StorefrontVariant, from: HTMLElement) {
    // The listing has no variant stock or photos; the variant brings both.
    const preview = productPreview(
      { ...product, stock: variant.stock, variant_images: variant.images },
      variant,
    );
    flyToBag(from, preview.image);
    setState("added");
    onAdded();
    add.mutate(
      { variant_id: variant.id, quantity: 1, preview, announce: true },
      // The hook rolls back and says why; the card comes back as it was.
      { onError: () => setState("idle") },
    );
  }

  async function start(event: React.MouseEvent<HTMLButtonElement>) {
    if (state !== "idle") return;
    const button = event.currentTarget;
    setState("loading");
    let variants: StorefrontVariant[];
    try {
      // Shared with the product page's live stock; a tap on another card
      // for the same product, or a second tap, needn't ask again.
      variants = await queryClient.fetchQuery({
        queryKey: catalogKeys.product(product.slug),
        queryFn: ({ signal }) => fetchProductVariants(product.slug, signal),
        staleTime: 30_000,
      });
    } catch {
      setState("idle");
      toast.error("Couldn't load sizes. Try again.");
      return;
    }
    const plan = quickAddPlan(variants);
    if (plan.kind === "add") return addVariant(plan.variant, button);
    if (plan.kind === "choose") {
      setChoice({ name: plan.name, options: plan.choices });
      setState("choosing");
      return;
    }
    // Colour and size (or nothing left): chosen on the product page.
    setState("idle");
    onNavigate?.();
    router.push(href);
  }

  function cancel() {
    setState("idle");
    plus.current?.focus();
  }

  return (
    <m.li
      layout="position"
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.25 } }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="carousel-item w-32 shrink-0 snap-start space-y-2"
    >
      <div className="group relative aspect-[4/5] overflow-hidden rounded-media bg-surface">
        <Link
          href={href}
          onClick={onNavigate}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0"
        >
          {product.images[0] && (
            <Image
              src={product.images[0]}
              alt=""
              fill
              sizes="128px"
              className="object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]"
            />
          )}
        </Link>
        <AnimatePresence initial={false}>
          {state === "choosing" && choice ? (
            <SizeChips
              key="chips"
              name={choice.name}
              choices={choice.options}
              onPick={addVariant}
              onCancel={cancel}
            />
          ) : (
            <m.div
              key="plus"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="absolute right-1.5 bottom-1.5"
            >
              <Button
                ref={plus}
                variant="secondary"
                size="icon-sm"
                className="rounded-full shadow-sm"
                aria-label={
                  state === "added"
                    ? `Added ${product.name} to bag`
                    : `Add ${product.name} to bag`
                }
                aria-busy={state === "loading"}
                // Not disabled: the spinner and tick stay at full strength.
                aria-disabled={state !== "idle"}
                onClick={start}
              >
                {state === "loading" ? (
                  <SpinnerIcon className="animate-spin" />
                ) : state === "added" ? (
                  <CheckIcon weight="bold" />
                ) : (
                  <PlusIcon weight="bold" />
                )}
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <Link
        href={href}
        onClick={onNavigate}
        className="group block space-y-0.5"
      >
        <p className="truncate text-xs group-hover:underline">{product.name}</p>
        <Price
          price={product.price}
          selling={product.selling_price}
          offer={product.offer_price}
          className="text-xs"
        />
      </Link>
    </m.li>
  );
}

/**
 * The sizes a quick add asks for, over the photo. Sold-out ones are struck
 * and disabled; Escape or the cross puts the + back.
 */
function SizeChips({
  name,
  choices,
  onPick,
  onCancel,
}: {
  name: string;
  choices: QuickChoice[];
  onPick: (variant: StorefrontVariant, from: HTMLElement) => void;
  onCancel: () => void;
}) {
  const group = useRef<HTMLDivElement>(null);

  // Keyboard users land on the first size they can pick.
  useEffect(() => {
    group.current?.querySelector<HTMLButtonElement>("button:enabled")?.focus();
  }, []);

  return (
    <m.div
      ref={group}
      role="group"
      aria-label={`Choose a ${name.toLowerCase()}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      className="absolute inset-x-1 bottom-1 space-y-1 rounded-control bg-background/95 p-1 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-center justify-between pl-1">
        <span className="eyebrow text-[0.625rem]">{optionLabel(name)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel"
          onClick={onCancel}
          className="-my-1"
        >
          <XIcon />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {choices.map(({ value, variant }) => {
          const soldOut = variant.stock === 0;
          return (
            <button
              key={value}
              type="button"
              disabled={soldOut}
              aria-label={`${optionLabel(name)} ${value}${soldOut ? ", sold out" : ""}`}
              onClick={(event) => onPick(variant, event.currentTarget)}
              className={cn(
                "relative h-8 min-w-8 flex-1 rounded-control border border-border px-1.5 text-xs tabular-nums transition-[color,background-color,border-color] duration-200 outline-none hover:border-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                soldOut &&
                  "text-muted-foreground after:absolute after:inset-0 after:bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),currentColor_50%,transparent_calc(50%+0.5px))] after:opacity-50 hover:border-border",
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </m.div>
  );
}
