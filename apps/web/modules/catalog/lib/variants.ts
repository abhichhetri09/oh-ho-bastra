import type { OptionType, StorefrontVariant } from "@repo/types";
import { compareOptionValues } from "./option-order";

export type OptionGroup = { name: string; type: OptionType; values: string[] };

/**
 * Each option with its distinct values in shopper order (XS before S).
 * Colour options come first, then the rest in first-seen order.
 */
export function optionGroups(variants: StorefrontVariant[]): OptionGroup[] {
  const groups = new Map<string, OptionGroup>();
  for (const variant of variants) {
    for (const { name, value, type } of variant.options) {
      const group = groups.get(name) ?? { name, type, values: [] };
      if (type === "color") group.type = "color";
      if (!group.values.includes(value)) group.values.push(value);
      groups.set(name, group);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, values: [...g.values].sort(compareOptionValues) }))
    .sort((a, b) => Number(b.type === "color") - Number(a.type === "color"));
}

export type Selection = Record<string, string>;

export function selectionOf(variant: StorefrontVariant): Selection {
  return Object.fromEntries(variant.options.map((o) => [o.name, o.value]));
}

/** The variant whose options are exactly selection, if any. */
export function findVariant(
  variants: StorefrontVariant[],
  selection: Selection,
): StorefrontVariant | undefined {
  return variants.find(
    (v) =>
      v.options.length === Object.keys(selection).length &&
      v.options.every((o) => selection[o.name] === o.value),
  );
}

/**
 * Picking value for option name: the variant with that value that keeps as
 * many of the other current choices as possible, so switching size keeps
 * the colour when that combination exists.
 */
export function pickOption(
  variants: StorefrontVariant[],
  selection: Selection,
  name: string,
  value: string,
): StorefrontVariant | undefined {
  let best: StorefrontVariant | undefined;
  let bestScore = -1;
  for (const variant of variants) {
    const options = selectionOf(variant);
    if (options[name] !== value) continue;
    const score = Object.entries(selection).filter(
      ([n, v]) => n !== name && options[n] === v,
    ).length;
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best;
}

/** Whether value of option name exists alongside the other current choices. */
export function isAvailable(
  variants: StorefrontVariant[],
  selection: Selection,
  name: string,
  value: string,
): boolean {
  return variants.some((variant) => {
    const options = selectionOf(variant);
    return (
      options[name] === value &&
      Object.entries(selection).every(
        ([n, v]) => n === name || options[n] === v,
      )
    );
  });
}
