"use client";

import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * − n + with the buttons disabled at the bounds. It reports steps, not
 * values, so clicks faster than a render still each count.
 */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onStep,
  label,
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onStep: (step: 1 | -1) => void;
  /** What is being counted, for screen readers ("Merino Crew Sweater"). */
  label: string;
  className?: string;
}) {
  const button =
    // 44px on touch screens, the smallest comfortable tap target.
    "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30 pointer-coarse:size-11";
  return (
    <div
      className={cn(
        "inline-flex h-8 items-center overflow-hidden rounded-control border border-border pointer-coarse:h-11",
        className,
      )}
      role="group"
      aria-label={`Quantity of ${label}`}
    >
      <button
        type="button"
        className={button}
        onClick={() => onStep(-1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-3" />
      </button>
      <output
        className="w-7 text-center text-[0.8125rem] tabular-nums"
        aria-live="polite"
      >
        {value}
      </output>
      <button
        type="button"
        className={button}
        onClick={() => onStep(1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  );
}
