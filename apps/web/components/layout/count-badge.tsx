"use client";

import { AnimatePresence, m } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

/**
 * The small count on a header icon (bag, saved). It pops in and out, and
 * the number rolls when it changes. Decorative: the button's label says
 * the count.
 */
export function CountBadge({ count }: { count: number }) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <m.span
          key="badge"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center overflow-hidden rounded-full bg-primary px-1 font-mono text-[0.625rem] leading-none text-primary-foreground tabular-nums"
          aria-hidden
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={count}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {count > 99 ? "99+" : count}
            </m.span>
          </AnimatePresence>
        </m.span>
      )}
    </AnimatePresence>
  );
}
