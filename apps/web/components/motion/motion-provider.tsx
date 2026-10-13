"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

/**
 * Loads only the DOM animation features (strict: components must use `m.*`,
 * not `motion.*`, so the full bundle can't sneak in) and honours the user's
 * reduced-motion setting everywhere.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
