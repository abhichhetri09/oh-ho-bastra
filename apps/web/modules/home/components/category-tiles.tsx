import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { site } from "@/lib/site";

/**
 * Three ways into the shop (site.tiles): a dark photo tile each, the title
 * and a line of copy over the photo's shaded left side, and an accent
 * arrow. Slanted where the theme sets --slant (Volt). Phones scroll them
 * sideways, a card and a peek at a time.
 */
export function CategoryTiles() {
  return (
    <Stagger className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
      {site.tiles.map((tile) => (
        <StaggerItem
          key={tile.title}
          className="w-[78%] shrink-0 snap-start sm:w-auto"
        >
          <Link
            href={tile.href}
            className="slant group relative block aspect-8/5 overflow-hidden rounded-media border border-border bg-surface outline-offset-[-6px] focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Image
              src={tile.image}
              alt=""
              fill
              sizes="(min-width: 640px) 33vw, 80vw"
              className="object-cover object-right transition-transform duration-[1600ms] ease-out-expo group-hover:scale-[1.05]"
            />
            <div className="absolute inset-0 bg-linear-to-r from-[oklch(0.12_0_0/0.9)] via-[oklch(0.12_0_0/0.45)] to-transparent" />
            {/* Fixed light text: the photo is always shaded dark here. */}
            <div className="absolute inset-y-0 left-0 flex flex-col justify-center gap-2 py-5 pr-4 pl-[calc(1.25rem+var(--slant,0px))] text-[oklch(0.98_0_0)]">
              <h3 className="display text-3xl lg:text-4xl">{tile.title}</h3>
              <p className="max-w-[11rem] text-sm leading-snug opacity-85">
                {tile.body}
              </p>
              <span className="mt-2 flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground transition-transform duration-300 group-hover:translate-x-1">
                <ArrowRightIcon className="size-4" />
              </span>
            </div>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
