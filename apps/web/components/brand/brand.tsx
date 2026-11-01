"use client";

import Image from "next/image";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useStoreLogo } from "@/providers/brand-provider";
import { LogoMark } from "./logo-mark";

/**
 * The store's brand wherever it heads a page: the admin's uploaded logo, or
 * the built-in mark beside the name. Sized by the surrounding font size
 * (the logo's height is 1.1em), so each header keeps its own scale.
 */
export function Brand({ className }: { className?: string }) {
  const logo = useStoreLogo();
  if (logo) {
    return (
      <Image
        src={logo}
        alt={site.name}
        width={320}
        height={80}
        priority
        className={cn(
          "inline-block h-[1.1em] w-auto max-w-[10em] object-contain align-middle",
          className,
        )}
      />
    );
  }
  return (
    <span className={className}>
      <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
      {site.name}
    </span>
  );
}
