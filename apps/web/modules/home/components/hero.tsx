import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

/**
 * The landing hero: the headline rising in line by line on the left, the
 * photograph bleeding off the right edge and fading into the page behind
 * the text. Phones stack them: the photo, then the copy over its faded
 * foot. Everything animates with CSS so it plays on first paint, before
 * hydration; the image only animates transform, so it doesn't delay the
 * LCP.
 */
export function Hero() {
  const { hero } = site;
  return (
    <section className="relative overflow-hidden lg:min-h-144">
      <div className="relative aspect-4/3 bg-surface sm:aspect-video lg:absolute lg:inset-y-0 lg:right-0 lg:left-[38%] lg:aspect-auto">
        <Image
          src={hero.image}
          alt={hero.imageAlt}
          fill
          preload
          sizes="(min-width: 1024px) 62vw, 100vw"
          className="animate-[hero-settle_2.2s_var(--ease-out-expo)_both] object-cover [filter:var(--hero-tone,none)]"
        />
        <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent lg:bg-linear-to-r lg:from-background lg:via-transparent lg:via-25%" />
      </div>

      <div className="relative container-page -mt-16 space-y-7 pb-4 sm:-mt-24 lg:mt-0 lg:flex lg:min-h-144 lg:flex-col lg:justify-center lg:py-16">
        <h1 className="display max-w-[10ch] text-[clamp(2.75rem,6.5vw,6.5rem)]">
          {hero.title.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <span
                className="animate-rise block"
                style={{ "--i": i + 1 } as React.CSSProperties}
              >
                {i === hero.title.length - 1 ? <em>{line}</em> : line}
              </span>
            </span>
          ))}
        </h1>
        <p
          className="animate-rise max-w-sm text-base leading-relaxed text-muted-foreground"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          {hero.body}
        </p>
        <div
          className="animate-rise flex flex-wrap items-center gap-3"
          style={{ "--i": 5 } as React.CSSProperties}
        >
          <Link
            href={hero.cta.href}
            className={buttonVariants({ size: "lg", className: "group" })}
          >
            {hero.cta.label}
            <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
