"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { useActiveNav } from "./use-active-nav";
import type { Collection as NavCategory } from "@/modules/catalog/api";
import { SearchDialog } from "@/modules/search/components/search-dialog";
import { BagButton, BagDrawer } from "@/modules/cart/components/bag";
import {
  WishlistDrawer,
  WishlistHeaderButton,
} from "@/modules/wishlist/components/wishlist-drawer";
import { UserMenu } from "./user-menu";
import { LogoMark } from "@/components/brand/logo-mark";

/**
 * The sticky header. It sits flush on the page at the top and gains a
 * hairline and a frosted background once the page scrolls. Root categories
 * open a full-width panel (hover or keyboard) with their subcategories,
 * quick links and a photo.
 */
export function HeaderShell({ categories }: { categories: NavCategory[] }) {
  const bar = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled
          ? "border-border bg-background/85 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-background",
      )}
    >
      <div
        ref={bar}
        className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 lg:grid-cols-[auto_1fr_auto]"
      >
        <div className="flex items-center lg:hidden">
          <MobileNav categories={categories} />
        </div>

        <Link
          href="/"
          className="font-serif text-[1.65rem] leading-none tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
          {site.name}
        </Link>

        <DesktopNav categories={categories} anchor={bar} />

        <div className="flex items-center justify-end gap-0.5">
          <SearchDialog collections={categories} />
          <UserMenu />
          {/* Phones keep the wishlist in the menus: the header is full. */}
          <WishlistHeaderButton className="hidden sm:inline-flex" />
          <BagButton />
        </div>
      </div>
      <BagDrawer />
      <WishlistDrawer />
    </header>
  );
}

const navLink =
  "relative flex h-16 items-center px-3 text-[0.8125rem] outline-none transition-colors hover:text-foreground focus-visible:text-foreground after:absolute after:inset-x-3 after:bottom-[18px] after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:ease-out-expo hover:after:scale-x-100 data-popup-open:after:scale-x-100 aria-[current=page]:text-foreground aria-[current=page]:after:scale-x-100";

function DesktopNav({
  categories,
  anchor,
}: {
  categories: NavCategory[];
  anchor: React.RefObject<HTMLDivElement | null>;
}) {
  const active = useActiveNav(categories);

  return (
    <NavigationMenu.Root
      className="hidden justify-center lg:flex"
      delay={80}
      closeDelay={120}
    >
      <NavigationMenu.List className="flex items-center text-muted-foreground">
        <NavigationMenu.Item>
          <NavigationMenu.Link
            render={<Link href="/shop" />}
            active={active === "shop"}
            className={navLink}
          >
            Shop all
          </NavigationMenu.Link>
        </NavigationMenu.Item>

        {categories.map((category) => (
          <NavigationMenu.Item key={category.slug}>
            <NavigationMenu.Trigger
              className={cn(navLink, "data-popup-open:text-foreground")}
              // Clicking the trigger goes to the category; hover opens the panel.
              render={
                <Link
                  href={`/categories/${category.slug}`}
                  aria-current={active === category.slug ? "page" : undefined}
                />
              }
              nativeButton={false}
            >
              {category.name}
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="h-full w-full transition-[opacity,translate] duration-500 ease-out-expo data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:opacity-0">
              <MegaPanel category={category} />
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ))}

        <NavigationMenu.Item>
          <NavigationMenu.Link
            render={<Link href="/shop?featured=true" />}
            active={active === "featured"}
            className={navLink}
          >
            Editor&apos;s picks
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Backdrop className="fixed inset-0 top-16 z-30 bg-[oklch(0.2_0.012_60/0.18)] transition-opacity duration-500 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <NavigationMenu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={0}
          collisionAvoidance={{ side: "none", align: "none" }}
          className="z-40 w-[var(--anchor-width)]"
        >
          <NavigationMenu.Popup className="h-[var(--popup-height)] w-full overflow-hidden border-b border-border bg-background shadow-[0_30px_60px_-30px_oklch(0.2_0.012_60/0.25)] transition-[height,opacity] duration-500 ease-out-expo outline-none data-ending-style:opacity-0 data-starting-style:opacity-0">
            <NavigationMenu.Viewport className="relative h-full w-full" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function MegaPanel({ category }: { category: NavCategory }) {
  const base = `/categories/${category.slug}`;
  const quickLinks = [
    { label: "New arrivals", href: base },
    { label: "Editor's picks", href: `${base}?featured=true` },
    { label: "Under €30", href: `${base}?max=30` },
  ];

  return (
    <div className="container-page grid grid-cols-[1fr_1fr_minmax(0,22rem)] gap-12 py-10">
      <div>
        <p className="eyebrow mb-5">{category.name}</p>
        <ul className="space-y-1.5">
          {category.children.map((child, i) => (
            <li
              key={child.slug}
              className="animate-rise"
              style={{ "--i": i } as React.CSSProperties}
            >
              <NavigationMenu.Link
                render={<Link href={`/categories/${child.slug}`} />}
                className="link-underline font-serif text-3xl leading-tight outline-none focus-visible:text-clay"
              >
                {child.name}
              </NavigationMenu.Link>
            </li>
          ))}
          <li className="pt-4">
            <NavigationMenu.Link
              render={<Link href={base} />}
              className="group inline-flex items-center gap-2 text-[0.8125rem] outline-none focus-visible:underline"
            >
              Shop all {category.name.toLowerCase()}
              <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </NavigationMenu.Link>
          </li>
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-5">Discover</p>
        <ul className="space-y-3 text-[0.8125rem]">
          {quickLinks.map((link) => (
            <li key={link.label}>
              <NavigationMenu.Link
                render={<Link href={link.href} />}
                className="link-underline text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
              >
                {link.label}
              </NavigationMenu.Link>
            </li>
          ))}
        </ul>
      </div>

      {category.image && (
        <NavigationMenu.Link
          render={<Link href={base} />}
          className="group block outline-none"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-media bg-surface">
            <Image
              src={category.image}
              alt=""
              fill
              sizes="22rem"
              className="object-cover transition-transform duration-[1400ms] ease-out-expo group-hover:scale-105"
            />
          </div>
          {category.imageCaption && (
            <p className="mt-3 text-xs text-muted-foreground">
              New in:{" "}
              <span className="text-foreground">{category.imageCaption}</span>
            </p>
          )}
        </NavigationMenu.Link>
      )}
    </div>
  );
}
