"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HeartIcon,
  ListIcon,
  PackageIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { site } from "@/lib/site";
import { useAuth } from "@/providers/auth-provider";
import type { Collection as NavCategory } from "@/modules/catalog/api";
import { useSavedCount } from "@/modules/wishlist/hooks";
import { useWishlistDrawer } from "@/modules/wishlist/store";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import { SignInLink } from "@/modules/auth/components/sign-in-link";
import { useActiveNav } from "./use-active-nav";

const accountLink =
  "-mx-2 flex h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-muted";

/** Full-height navigation sheet for small screens. */
export function MobileNav({ categories }: { categories: NavCategory[] }) {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const savedCount = useSavedCount();
  const openWishlist = useWishlistDrawer((s) => s.setOpen);
  const close = () => setOpen(false);
  const active = useActiveNav(categories);
  // The current section, underlined like the desktop header's.
  const mark = (section: string) =>
    active === section && "underline decoration-1 underline-offset-[0.2em]";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="-ml-2" />}
      >
        <ListIcon className="size-5" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-full gap-0 p-0 sm:max-w-sm">
        <div className="flex h-16 items-center border-b border-border px-5">
          <SheetTitle className="font-serif text-2xl font-normal">
            <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
            {site.name}
          </SheetTitle>
        </div>

        <nav className="flex-1 overflow-y-auto px-5 py-6" aria-label="Main">
          <Link
            href="/shop"
            onClick={close}
            aria-current={active === "shop" ? "page" : undefined}
            className={cn(
              "animate-rise block py-3 font-serif text-4xl",
              mark("shop"),
            )}
          >
            Shop all
          </Link>
          <Accordion>
            {categories.map((category, i) => (
              <AccordionItem
                key={category.slug}
                value={category.slug}
                className="animate-rise border-none"
                style={{ "--i": i + 1 } as React.CSSProperties}
              >
                <AccordionTrigger
                  className={cn(
                    "py-3 font-serif text-4xl font-normal hover:no-underline",
                    mark(category.slug),
                  )}
                >
                  {category.name}
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-3 border-l border-border pl-4">
                    {category.children.map((child) => (
                      <li key={child.slug}>
                        <Link
                          href={`/categories/${child.slug}`}
                          onClick={close}
                          className="text-base"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link
                        href={`/categories/${category.slug}`}
                        onClick={close}
                        className="text-sm text-muted-foreground"
                      >
                        Shop all {category.name.toLowerCase()}
                      </Link>
                    </li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <Link
            href="/shop?featured=true"
            onClick={close}
            aria-current={active === "featured" ? "page" : undefined}
            className={cn(
              "animate-rise block py-3 font-serif text-4xl",
              mark("featured"),
            )}
            style={{ "--i": categories.length + 1 } as React.CSSProperties}
          >
            Editor&apos;s picks
          </Link>
        </nav>

        <div className="space-y-2 border-t border-border px-5 py-5 text-sm">
          {user ? (
            <ul className="space-y-1">
              <li>
                <Link
                  href="/account/orders"
                  onClick={close}
                  className={accountLink}
                >
                  <PackageIcon weight="light" className="size-5" />
                  Orders
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openWishlist(true);
                  }}
                  className={accountLink}
                >
                  <HeartIcon weight="light" className="size-5" />
                  Wishlist
                  {savedCount > 0 && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                      {savedCount}
                    </span>
                  )}
                </button>
              </li>
              <li>
                <Link href="/account" onClick={close} className={accountLink}>
                  <UserCircleIcon weight="light" className="size-5" />
                  Account
                </Link>
              </li>
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <SignInLink
                onClick={close}
                className="flex h-11 items-center justify-center rounded-control border border-border"
              >
                Sign in
              </SignInLink>
              <SignInLink
                register
                onClick={close}
                className="flex h-11 items-center justify-center bg-primary text-primary-foreground"
              >
                Create account
              </SignInLink>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
