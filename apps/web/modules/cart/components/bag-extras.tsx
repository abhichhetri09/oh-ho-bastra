"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ProductWithPrice } from "@repo/types";
import { listProducts } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { catalogKeys } from "@/modules/catalog/keys";
import { Price } from "@/modules/catalog/components/price";

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

/**
 * A few products the shopper might add, leaving out what's already in the
 * bag and anything sold out. Each opens its product page (to pick a size).
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
  const products = (picks.data ?? [])
    .filter((p) => p.in_stock && !inBag.includes(p.id))
    .slice(0, PICKS);
  if (products.length === 0) return null;
  return (
    <section className={cn("space-y-3", className)}>
      <p className="eyebrow">You may also like</p>
      <ul className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5">
        {products.map((product) => (
          <PickCard
            key={product.id}
            product={product}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}

function PickCard({
  product,
  onNavigate,
}: {
  product: ProductWithPrice;
  onNavigate?: () => void;
}) {
  return (
    <li className="w-32 shrink-0 snap-start">
      <Link
        href={`/products/${product.slug}`}
        onClick={onNavigate}
        className="group block space-y-2"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-surface">
          {product.images[0] && (
            <Image
              src={product.images[0]}
              alt=""
              fill
              sizes="128px"
              className="object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]"
            />
          )}
        </div>
        <div className="space-y-0.5">
          <p className="truncate text-xs group-hover:underline">
            {product.name}
          </p>
          <Price
            price={product.price}
            selling={product.selling_price}
            offer={product.offer_price}
            className="text-xs"
          />
        </div>
      </Link>
    </li>
  );
}
