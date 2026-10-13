"use client";

import type { StorefrontVariant } from "@repo/types";
import { swatchColor } from "@/lib/swatches";
import { cn } from "@/lib/utils";
import { optionLabel } from "../lib/option-order";
import {
  isAvailable,
  pickOption,
  type OptionGroup,
  type Selection,
} from "../lib/variants";

/**
 * Colour swatches and size pills. A value whose closest variant is sold out
 * is struck through but still selectable (to show it's sold out); a value
 * with no variant alongside the other choices is dashed.
 */
export function VariantSelector({
  groups,
  variants,
  selection,
  onChoose,
}: {
  groups: OptionGroup[];
  variants: StorefrontVariant[];
  selection: Selection;
  onChoose: (name: string, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <fieldset key={group.name} className="space-y-3">
          <legend className="flex items-baseline gap-2 text-[0.8125rem]">
            <span className="eyebrow">{optionLabel(group.name)}</span>
            <span>{selection[group.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const selected = selection[group.name] === value;
              const available = isAvailable(
                variants,
                selection,
                group.name,
                value,
              );
              const target = pickOption(variants, selection, group.name, value);
              const soldOut = (target?.stock ?? 0) === 0;
              const label = `${optionLabel(group.name)} ${value}${soldOut ? ", sold out" : ""}`;

              return group.type === "color" ? (
                <Swatch
                  key={value}
                  value={value}
                  selected={selected}
                  soldOut={soldOut}
                  label={label}
                  onClick={() => onChoose(group.name, value)}
                />
              ) : (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={label}
                  onClick={() => onChoose(group.name, value)}
                  className={cn(
                    "relative h-11 min-w-14 border px-4 text-[0.8125rem] tabular-nums transition-[color,background-color,border-color] duration-200",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-foreground",
                    !available &&
                      !selected &&
                      "border-dashed text-muted-foreground",
                    soldOut &&
                      "text-muted-foreground after:absolute after:inset-0 after:bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),currentColor_50%,transparent_calc(50%+0.5px))] after:opacity-50",
                    soldOut && selected && "text-primary-foreground/70",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function Swatch({
  value,
  selected,
  soldOut,
  label,
  onClick,
}: {
  value: string;
  selected: boolean;
  soldOut: boolean;
  label: string;
  onClick: () => void;
}) {
  const color = swatchColor(value);
  if (!color) {
    // Unknown colour name: a labelled chip instead of a guessed swatch.
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "h-11 rounded-control border px-4 text-[0.8125rem] transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-foreground",
          soldOut && "line-through",
        )}
      >
        {value}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={value}
      onClick={onClick}
      className={cn(
        "relative size-10 rounded-full ring-offset-[3px] ring-offset-background transition-[box-shadow,transform] duration-300 ease-out-expo hover:scale-105",
        selected
          ? "ring-[1.5px] ring-foreground"
          : "ring-1 ring-transparent hover:ring-border",
        // A hairline keeps white and cream swatches visible on paper.
        "shadow-[inset_0_0_0_1px_var(--border)]",
      )}
      style={{ background: color }}
    >
      {soldOut && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[linear-gradient(to_top_right,transparent_calc(50%-0.75px),var(--background)_50%,transparent_calc(50%+0.75px))]"
        />
      )}
    </button>
  );
}
