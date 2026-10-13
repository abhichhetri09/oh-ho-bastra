/**
 * A meta description: whitespace collapsed, cut at a word boundary to at
 * most `max` characters (search results truncate around 155-160).
 */
export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // One character is left for the ellipsis.
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const wordEnds = clean[max - 1] === " ";
  // A single long word is cut mid-word rather than dropped.
  const head = wordEnds || space <= max / 2 ? cut : cut.slice(0, space);
  return `${head.replace(/[\s,.;:–—-]+$/, "")}…`;
}
