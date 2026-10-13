import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/reveal";
import { buttonVariants } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section className="container-page">
      <Reveal className="relative overflow-hidden bg-primary px-6 py-20 text-center text-primary-foreground sm:py-28">
        <p className="font-mono text-[0.6875rem] tracking-[0.16em] uppercase opacity-70">
          The Oh Ho Bastra way
        </p>
        <h2 className="display mx-auto mt-5 max-w-3xl text-5xl sm:text-7xl">
          Fewer, <em>better</em> tees.
        </h2>
        <Link
          href="/shop"
          className={buttonVariants({
            size: "lg",
            className:
              "group mt-10 bg-primary-foreground text-primary hover:bg-primary-foreground/90",
          })}
        >
          Explore the shop
          <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
        {/* Slow rotating ring as a quiet ornament. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-96 animate-[spin_60s_linear_infinite] rounded-full border border-primary-foreground/10 motion-reduce:animate-none"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-52 -left-32 size-[28rem] rounded-full border border-primary-foreground/10"
        />
      </Reveal>
    </section>
  );
}
