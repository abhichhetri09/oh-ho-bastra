"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, useScroll, useTransform } from "motion/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/reveal";
import { site } from "@/lib/site";

/** An editorial split: the photo drifts against the scroll (parallax). */
export function StoryBand() {
  const { story } = site;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <section className="container-page grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
      <div
        ref={ref}
        className="relative aspect-[3/2] overflow-hidden rounded-media bg-surface lg:col-span-7"
      >
        <m.div className="absolute -inset-y-[10%] inset-x-0" style={{ y }}>
          <Image
            src={story.image}
            alt={story.imageAlt}
            fill
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover"
          />
        </m.div>
      </div>
      <Reveal className="space-y-6 lg:col-span-5">
        <p className="eyebrow">{story.eyebrow}</p>
        <h2 className="display text-5xl sm:text-6xl">{story.title}</h2>
        <p className="max-w-md leading-relaxed text-muted-foreground">
          {story.body}
        </p>
        <Link
          href={story.href}
          className="group inline-flex items-center gap-2 text-[0.8125rem]"
        >
          <span className="link-underline">{story.cta}</span>
          <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </Reveal>
    </section>
  );
}
