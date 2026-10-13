"use client";

import { m, type HTMLMotionProps } from "motion/react";
import { fadeUp, reveal, stagger } from "@/lib/motion";

// Scroll reveals for content below the fold. Above-the-fold content uses the
// CSS animations in globals.css instead, so it paints before hydration.

const viewport = { once: true, margin: "0px 0px -12% 0px" } as const;

/** Fades and lifts its content in when it scrolls into view. */
export function Reveal({
  delay = 0,
  y = 24,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ ...reveal, delay }}
      {...props}
    />
  );
}

/** Reveals its StaggerItem children one after another. */
export function Stagger({
  gap,
  delay,
  ...props
}: HTMLMotionProps<"div"> & { gap?: number; delay?: number }) {
  return (
    <m.div
      variants={stagger(gap, delay)}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      {...props}
    />
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <m.div variants={fadeUp} {...props} />;
}
