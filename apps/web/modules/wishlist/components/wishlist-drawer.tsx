"use client";

import Image from "next/image";
import Link from "next/link";
import { HeartIcon, XIcon } from "@phosphor-icons/react";
import type { WishlistProduct } from "@repo/types";
import { CountBadge } from "@/components/layout/count-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Price } from "@/modules/catalog/components/price";
import { useAuth } from "@/providers/auth-provider";
import { SignInLink } from "@/modules/auth/components/sign-in-link";
import { useSavedCount, useSavedProducts, useToggleWishlist } from "../hooks";
import { useWishlistDrawer } from "../store";
import { SavedItemAction } from "./saved-item-action";

/** The header heart: the saved count, opening the wishlist drawer. */
export function WishlistHeaderButton({ className }: { className?: string }) {
  const count = useSavedCount();
  const setOpen = useWishlistDrawer((s) => s.setOpen);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      onClick={() => setOpen(true)}
      aria-label={count > 0 ? `Wishlist, ${count} saved` : "Wishlist"}
    >
      <HeartIcon weight="light" className="size-5" />
      <CountBadge count={count} />
    </Button>
  );
}

/** The wishlist as a side sheet, like the bag. */
export function WishlistDrawer() {
  const open = useWishlistDrawer((s) => s.open);
  const setOpen = useWishlistDrawer((s) => s.setOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <WishlistContents close={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function WishlistContents({ close }: { close: () => void }) {
  const user = useAuth((s) => s.user);
  const count = useSavedCount();
  const { query, products } = useSavedProducts();

  const header = (
    <SheetHeader className="flex-row items-baseline gap-2 border-b border-border px-5 py-5">
      <SheetTitle className="font-serif text-2xl font-normal">
        Wishlist
      </SheetTitle>
      {user && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} saved
        </span>
      )}
    </SheetHeader>
  );

  if (!user) {
    return (
      <>
        {header}
        <EmptyWishlist
          title="Sign in to save pieces."
          body="Your wishlist is kept on your account, so it follows you between devices."
          action={
            <SignInLink onClick={close} className={buttonVariants()}>
              Sign in
            </SignInLink>
          }
        />
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {header}
        <div className="space-y-6 px-5 py-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[5rem_1fr] gap-4">
              <Skeleton className="aspect-[4/5]" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (query.isError && !query.data) {
    return (
      <>
        {header}
        <EmptyWishlist
          title="We couldn't load your wishlist."
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  if (products.length === 0) {
    return (
      <>
        {header}
        <EmptyWishlist
          title="Nothing saved yet."
          body="Tap the heart on anything you love and it will wait here."
          action={
            <Link href="/shop" onClick={close} className={buttonVariants()}>
              Browse the shop
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5">
        <ul className="divide-y divide-border">
          {products.map((product) => (
            <SavedRow key={product.id} product={product} close={close} />
          ))}
        </ul>
        {query.hasNextPage && (
          <div className="flex justify-center py-5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      <SheetFooter className="border-t border-border bg-background p-5">
        <Link
          href="/account/wishlist"
          onClick={close}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          View full wishlist
        </Link>
      </SheetFooter>
    </>
  );
}

/** One saved product: photo, name, price, what it offers and remove. */
function SavedRow({
  product,
  close,
}: {
  product: WishlistProduct;
  close: () => void;
}) {
  const toggle = useToggleWishlist();
  const href = `/products/${product.slug}`;
  const image = product.images[0];

  return (
    <li className="grid grid-cols-[auto_1fr] gap-4 py-5">
      <Link
        href={href}
        onClick={close}
        className="relative block aspect-[4/5] w-20 overflow-hidden rounded-media bg-surface"
        tabIndex={-1}
        aria-hidden
      >
        {image && (
          <Image
            src={image}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        )}
      </Link>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={href}
            onClick={close}
            className="link-underline line-clamp-2 text-sm"
          >
            {product.name}
          </Link>
          <button
            type="button"
            onClick={() => toggle(product.id, false, product.name)}
            aria-label={`Remove ${product.name} from wishlist`}
            className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <Price
          price={product.price}
          selling={product.selling_price}
          offer={product.offer_price}
          className="text-[0.8125rem]"
        />
        <SavedItemAction
          product={product}
          onNavigate={close}
          className="mt-auto self-start"
        />
      </div>
    </li>
  );
}

function EmptyWishlist({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <HeartIcon weight="thin" className="size-12 text-muted-foreground" />
      <p className="display text-3xl">{title}</p>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      <div className="pt-2">{action}</div>
    </div>
  );
}
