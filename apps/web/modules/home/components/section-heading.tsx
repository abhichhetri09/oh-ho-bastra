import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = "View all",
  className,
}: {
  eyebrow: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-10 flex items-end justify-between gap-6 sm:mb-14",
        className,
      )}
    >
      <div className="space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="display text-4xl sm:text-5xl lg:text-6xl">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="group hidden shrink-0 items-center gap-2 pb-2 text-[0.8125rem] sm:inline-flex"
        >
          <span className="link-underline">{linkLabel}</span>
          <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}
