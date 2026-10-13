import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The logo alone, for pages outside the shop layout (auth, errors, 404). */
export function MinimalHeader({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-16 items-center", className)}>
      <Link href="/" className="font-serif text-[1.65rem] leading-none">
        <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
        {site.name}
      </Link>
    </div>
  );
}
