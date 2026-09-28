import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Choice<T extends string> = {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  /** Right-aligned extra, e.g. a price (card variant). */
  aside?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
};

type ChoiceGroupProps<T extends string> = {
  name: string;
  value: T | undefined;
  onChange: (value: T) => void;
  choices: Choice<T>[];
  /** chip: compact toggle buttons. card: full-width rows with a visible radio. */
  variant?: "chip" | "card";
  className?: string;
};

const chipBase =
  "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border px-3 text-center text-sm has-focus-visible:ring-1 has-focus-visible:ring-ring";
const cardBase = "flex cursor-pointer items-start gap-3 rounded-lg border p-4";

/** Single-select radio group rendered as chips or cards. */
export function ChoiceGroup<T extends string>({
  name,
  value,
  onChange,
  choices,
  variant = "chip",
  className,
}: ChoiceGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(variant === "chip" ? "flex flex-wrap gap-2" : "grid gap-3", className)}
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <label
            key={choice.value}
            aria-label={choice.ariaLabel}
            className={cn(
              variant === "chip" ? chipBase : cardBase,
              selected
                ? variant === "chip"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground"
                : "border-input hover:border-foreground",
              choice.disabled &&
                "cursor-not-allowed text-muted-foreground line-through hover:border-input",
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={selected}
              disabled={choice.disabled}
              onChange={() => onChange(choice.value)}
              className={variant === "chip" ? "sr-only" : "mt-1 accent-foreground"}
            />
            {variant === "chip" ? (
              choice.label
            ) : (
              <>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{choice.label}</span>
                  {choice.description ? (
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {choice.description}
                    </span>
                  ) : null}
                </span>
                {choice.aside ? <span className="text-sm tabular-nums">{choice.aside}</span> : null}
              </>
            )}
          </label>
        );
      })}
    </div>
  );
}
