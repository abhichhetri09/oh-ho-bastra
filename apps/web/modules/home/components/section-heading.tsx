import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = "View all",
  className,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "mb-10 flex items-end justify-between gap-6 sm:mb-14",
        className,
      )}
    >
      <div className="space-y-3">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <div className="flex items-center gap-5">
          <h2 className="display text-4xl sm:text-5xl lg:text-6xl">
            <Emphasised title={title} />
          </h2>
          <span aria-hidden className="stripes" />
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-2 pb-2 text-[0.8125rem] text-clay"
        >
          <span className="link-underline">{linkLabel}</span>
          <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </Reveal>
  );
}

/**
 * The title with its last word in the theme's emphasis, as the hero's last
 * line is: an accent colour (and italic) in themes that set one, plain in
 * the rest.
 */
function Emphasised({ title }: { title: string }) {
  const cut = title.trimEnd().lastIndexOf(" ");
  if (cut === -1) return <em>{title}</em>;
  return (
    <>
      {title.slice(0, cut + 1)}
      <em>{title.slice(cut + 1)}</em>
    </>
  );
}
