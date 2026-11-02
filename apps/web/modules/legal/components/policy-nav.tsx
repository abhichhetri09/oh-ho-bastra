"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The other policies: a scrolling tab bar on phones, a vertical list from lg.
 * On phones the current policy is scrolled into view, so a tab further along
 * the bar isn't left off-screen.
 */
export function PolicyNav({
  policies,
  current,
}: {
  policies: readonly { href: string; label: string }[];
  current: string;
}) {
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = list.current;
    const active = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (!el || !active) return;
    el.scrollLeft =
      active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
  }, [current]);

  return (
    <nav aria-label="Policies">
      <p className="eyebrow mb-3 hidden lg:block">All policies</p>
      <ul
        ref={list}
        className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto pr-10 pl-4 shadow-[inset_0_-1px_0_var(--color-border)] [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-2.5rem),transparent)] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pr-0 lg:pl-0 lg:shadow-none lg:[mask-image:none]"
      >
        {policies.map((policy) => {
          const active = policy.href === current;
          return (
            <li key={policy.href} className="shrink-0">
              <Link
                href={policy.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block py-3 text-sm whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-transform after:duration-300 lg:rounded-control lg:px-3 lg:py-2 lg:text-[0.8125rem] lg:after:hidden",
                  active
                    ? "font-medium text-foreground after:scale-x-100 lg:bg-secondary lg:font-normal"
                    : "text-muted-foreground after:scale-x-0 hover:text-foreground lg:hover:bg-secondary/60",
                )}
              >
                {policy.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
