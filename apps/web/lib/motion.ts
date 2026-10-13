import type { Transition, Variants } from "motion/react";

// One motion vocabulary for the whole store: a long expo ease-out for
// reveals and a snappy spring for interactive feedback.

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const reveal: Transition = { duration: 0.9, ease: EASE_OUT };

export const spring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: reveal },
};

export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});
