const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Letter sizes, then numeric sizes, then anything else (colours, names).
function rank(value: string): number {
  if (SIZE_ORDER.includes(value.toUpperCase())) return 0;
  if (value.trim() !== "" && !Number.isNaN(Number(value))) return 1;
  return 2;
}

/** Sorts option values the way shoppers expect: XS before S, 40 before 41. */
export function compareOptionValues(a: string, b: string): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) {
    return (
      SIZE_ORDER.indexOf(a.toUpperCase()) - SIZE_ORDER.indexOf(b.toUpperCase())
    );
  }
  if (ra === 1) return Number(a) - Number(b);
  return a.localeCompare(b);
}

/** "color" → "Colour"-style display label: capitalised, as entered. */
export function optionLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
