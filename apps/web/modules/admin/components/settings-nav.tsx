"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MegaphoneIcon,
  PaletteIcon,
  StorefrontIcon,
  TruckIcon,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  isSettingsCurrent,
  SETTINGS_PAGES,
  type SettingsPageId,
} from "../lib/settings";

export const SETTINGS_ICONS: Record<SettingsPageId, Icon> = {
  store: StorefrontIcon,
  appearance: PaletteIcon,
  announcements: MegaphoneIcon,
  delivery: TruckIcon,
};

/**
 * The settings pages: a sticky list beside the page on wide screens, a row
 * of tabs that scrolls sideways above it on narrower ones (the current tab
 * scrolled into view).
 */
export function SettingsNav() {
  const pathname = usePathname();
  const tabs = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = tabs.current;
    const current = list?.querySelector<HTMLElement>("[aria-current=page]");
    if (!list || !current) return;
    list.scrollLeft =
      current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav aria-label="Settings" className="min-w-0">
      <ul
        ref={tabs}
        className="relative -mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:hidden [&::-webkit-scrollbar]:hidden"
      >
        {SETTINGS_PAGES.map(({ id, href, label }) => {
          const TabIcon = SETTINGS_ICONS[id];
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={
                  isSettingsCurrent(pathname, href) ? "page" : undefined
                }
                className="-mb-px flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-[0.8125rem] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
              >
                <TabIcon className="size-4" weight="light" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="hidden flex-col gap-0.5 xl:sticky xl:top-24 xl:flex">
        {SETTINGS_PAGES.map(({ id, href, label, hint }) => {
          const LinkIcon = SETTINGS_ICONS[id];
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={
                  isSettingsCurrent(pathname, href) ? "page" : undefined
                }
                className={cn(
                  "group flex items-start gap-3 rounded-control px-3 py-2.5 text-muted-foreground transition-colors hover:bg-surface/70 hover:text-foreground",
                  "aria-[current=page]:bg-surface aria-[current=page]:text-foreground",
                )}
              >
                <LinkIcon className="mt-0.5 size-4 shrink-0" weight="light" />
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] leading-5">
                    {label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
