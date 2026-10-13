// Colour option values are free text ("Purple", "Sky"). Known names map to a
// tuned swatch; unknown ones get null and render as a labelled chip. (No
// CSS.supports() fallback: it would differ between server and client
// renders.)

const SWATCHES: Record<string, string> = {
  black: "oklch(0.2 0.01 60)",
  white: "oklch(0.98 0.005 85)",
  ivory: "oklch(0.95 0.03 90)",
  ecru: "oklch(0.9 0.035 85)",
  sand: "oklch(0.84 0.05 80)",
  camel: "oklch(0.68 0.09 65)",
  tan: "oklch(0.7 0.08 60)",
  brown: "oklch(0.42 0.07 50)",
  rust: "oklch(0.52 0.14 40)",
  clay: "oklch(0.58 0.12 40)",
  coral: "oklch(0.7 0.15 30)",
  rose: "oklch(0.78 0.08 15)",
  pink: "oklch(0.78 0.12 350)",
  red: "oklch(0.55 0.2 27)",
  mustard: "oklch(0.78 0.15 85)",
  yellow: "oklch(0.88 0.16 95)",
  olive: "oklch(0.55 0.08 120)",
  sage: "oklch(0.72 0.05 140)",
  mint: "oklch(0.88 0.06 165)",
  green: "oklch(0.55 0.13 150)",
  teal: "oklch(0.55 0.08 195)",
  sky: "oklch(0.8 0.08 235)",
  azure: "oklch(0.62 0.16 245)",
  blue: "oklch(0.5 0.17 260)",
  denim: "oklch(0.48 0.1 255)",
  navy: "oklch(0.3 0.08 265)",
  "heather blue": "oklch(0.68 0.05 250)",
  lavender: "oklch(0.78 0.08 300)",
  purple: "oklch(0.5 0.2 305)",
  grey: "oklch(0.65 0.005 80)",
  gray: "oklch(0.65 0.005 80)",
  charcoal: "oklch(0.32 0.008 60)",
  silver: "oklch(0.82 0.005 250)",
  gold: "oklch(0.78 0.12 85)",
};

/** A CSS colour for a colour option value, or null when it is unknown. */
export function swatchColor(value: string): string | null {
  return SWATCHES[value.trim().toLowerCase()] ?? null;
}

/** Light swatches need a visible ring against the paper background. */
export function isLightSwatch(value: string): boolean {
  return [
    "white",
    "ivory",
    "ecru",
    "silver",
    "sky",
    "yellow",
    "sand",
    "mint",
  ].includes(value.trim().toLowerCase());
}
