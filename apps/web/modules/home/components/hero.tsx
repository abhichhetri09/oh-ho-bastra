import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

/**
 * The landing hero: an asymmetric split with the serif headline rising in
 * line by line and the photograph settling from a slight zoom. Everything
 * animates with CSS so it plays on first paint, before hydration; the image
 * only animates transform, so it doesn't delay the LCP.
 */
export function Hero() {
  const { hero } = site;
  return (
    <section className="container-page grid items-center gap-10 pt-6 pb-16 lg:min-h-[calc(100svh-6.25rem)] lg:grid-cols-12 lg:gap-8 lg:pt-0 lg:pb-12">
      <div className="order-2 space-y-8 lg:order-1 lg:col-span-5 lg:pr-6">
        <p className="eyebrow animate-rise">{hero.eyebrow}</p>
        <h1 className="display text-[clamp(3.5rem,8.5vw,8.5rem)]">
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
          className="animate-rise max-w-md text-base leading-relaxed text-muted-foreground"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          {hero.body}
        </p>
        <div
          className="animate-rise flex flex-wrap items-center gap-6"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <Link
            href="/shop"
            className={buttonVariants({ size: "lg", className: "group" })}
          >
            Shop the collection
            <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link
            href="/shop?featured=true"
            className="link-underline text-[0.8125rem]"
          >
            Editor&apos;s picks
          </Link>
        </div>
      </div>

      <div className="relative order-1 lg:order-2 lg:col-span-7 lg:pl-10">
        <div className="relative aspect-[4/5] overflow-hidden rounded-media bg-surface sm:aspect-[5/4] lg:aspect-auto lg:h-[calc(100svh-10rem)] lg:min-h-[32rem]">
          <Image
            src={hero.image}
            alt={hero.imageAlt}
            fill
            preload
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="animate-[hero-settle_2.2s_var(--ease-out-expo)_both] object-cover"
          />
        </div>
        <div
          className="animate-rise absolute -bottom-8 left-0 hidden w-[34%] overflow-hidden rounded-media border-[6px] border-background bg-surface shadow-xl md:block lg:-left-6"
          style={{ "--i": 6 } as React.CSSProperties}
        >
          <div className="relative aspect-square">
            <Image
              src={hero.secondaryImage}
              alt={hero.secondaryAlt}
              fill
              sizes="20vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
