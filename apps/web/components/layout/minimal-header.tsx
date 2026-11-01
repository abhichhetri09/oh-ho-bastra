import Link from "next/link";
import { Brand } from "@/components/brand/brand";
import { cn } from "@/lib/utils";

/** The logo alone, for pages outside the shop layout (auth, errors, 404). */
export function MinimalHeader({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-16 items-center", className)}>
      <Link
        href="/"
        className="font-serif text-[1.65rem] leading-none whitespace-nowrap"
      >
        <Brand />
      </Link>
    </div>
  );
}
