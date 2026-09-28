import type { CartLine } from "./cart-context";

const storageKey = "ohhobastra:cart";

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") {
    return false;
  }
  const line = value as Record<string, unknown>;
  return (
    typeof line.slug === "string" &&
    typeof line.size === "string" &&
    typeof line.quantity === "number" &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
}

export function loadLines(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
  } catch {
    return [];
  }
}

export function saveLines(lines: CartLine[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(lines));
  } catch {
    // Storage full or blocked; the cart still works for this visit.
  }
}
