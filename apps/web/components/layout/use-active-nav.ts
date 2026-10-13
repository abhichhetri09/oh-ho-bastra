"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { activeNav, type NavSection } from "@/lib/nav";

/** The header entry for the current page (see activeNav). */
export function useActiveNav(
  categories: ReadonlyArray<{ slug: string; children: { slug: string }[] }>,
): NavSection | null {
  const pathname = usePathname();
  const featured = useSearchParams().get("featured") === "true";
  return activeNav(pathname, featured, categories);
}
