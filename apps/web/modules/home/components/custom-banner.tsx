import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

/** The custom-print banner: a photo on the left, the pitch and CTA beside it. */
export function CustomBanner() {
  const { custom } = site;
  return (
    <section className="container-page">
      <Reveal className="grid overflow-hidden rounded-panel border border-border bg-card lg:grid-cols-2">
        <div className="relative aspect-video bg-surface lg:aspect-auto lg:min-h-80">
          <Image
            src={custom.image}
            alt={custom.imageAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="space-y-5 p-6 sm:p-10 lg:self-center lg:p-14">
          <span aria-hidden className="stripes" />
          <h2 className="display text-4xl sm:text-5xl">{custom.title}</h2>
          <p className="max-w-sm leading-relaxed text-muted-foreground">
            {custom.body}
          </p>
          <Link
            href={custom.href}
            className={buttonVariants({ size: "lg", className: "group" })}
          >
            {custom.cta}
            <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
