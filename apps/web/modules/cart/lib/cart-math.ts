import {
  type Cart,
  type CartLine,
  MAX_LINE_QUANTITY,
  type ProductDetail,
  type StorefrontVariant,
  type WishlistProduct,
} from "@repo/types";

// Client copies of the API's cart arithmetic (handlers/cart buildCart), for
// optimistic updates. The server's answer replaces them once it arrives.

/** Whether a line can be checked out as it stands. */
export function lineIsReady(line: CartLine): boolean {
  return line.available && line.quantity <= line.stock;
}

/** Recomputes the totals from the lines. */
export function withTotals(items: CartLine[]): Cart {
  let itemCount = 0;
  let subtotal = 0;
  let hasIssues = false;
  for (const line of items) {
    if (!lineIsReady(line)) {
      hasIssues = true;
      continue;
    }
    itemCount += line.quantity;
    subtotal += line.price * line.quantity;
  }
  return { items, item_count: itemCount, subtotal, has_issues: hasIssues };
}

export function setLineQuantity(
  cart: Cart,
  variantId: string,
  quantity: number,
): Cart {
  return withTotals(
    cart.items.map((line) =>
      line.variant_id === variantId
        ? { ...line, quantity, line_total: line.price * quantity }
        : line,
    ),
  );
}

export function removeLine(cart: Cart, variantId: string): Cart {
  return withTotals(cart.items.filter((l) => l.variant_id !== variantId));
}

/** What a page knows about a variant, enough to show it in the bag. */
export type LinePreview = Omit<
  CartLine,
  "quantity" | "added_at" | "available" | "line_total" | "max_quantity"
>;

/** The bag line a product page would add: the chosen variant, else the default. */
export function productPreview(
  product: ProductDetail,
  variant: StorefrontVariant | undefined,
): LinePreview {
  // Like the API: the variant's first photo, else the product's.
  const image =
    (variant ? variant.images : product.variant_images)[0] ??
    product.images[0] ??
    "";
  return {
    variant_id: variant?.id ?? product.variant_id,
    product_id: product.id,
    product_name: product.name,
    product_slug: product.slug,
    sku: variant?.sku ?? null,
    stock: variant?.stock ?? product.stock,
    image,
    selling_price: variant?.selling_price ?? product.selling_price,
    offer_price: variant ? variant.offer_price : product.offer_price,
    price: variant?.price ?? product.price,
    options: variant?.options ?? [],
  };
}

/**
 * A saved product's only variant. The wishlist doesn't carry its stock or
 * options, so the line shows without them until the API answers.
 */
export function savedPreview(product: WishlistProduct): LinePreview {
  return {
    variant_id: product.variant_id,
    product_id: product.id,
    product_name: product.name,
    product_slug: product.slug,
    sku: null,
    stock: MAX_LINE_QUANTITY,
    image: product.images[0] ?? "",
    selling_price: product.selling_price,
    offer_price: product.offer_price,
    price: product.price,
    options: [],
  };
}

/**
 * Adds quantity of a variant the way the API would: onto its line, up to
 * what the line can hold, else as a new line from preview. Without a
 * preview, a new variant waits for the API's answer.
 */
export function addLine(
  cart: Cart,
  variantId: string,
  quantity: number,
  preview?: LinePreview,
): Cart {
  const line = cart.items.find((l) => l.variant_id === variantId);
  if (line) {
    // A line already above its cap keeps its quantity; the API refuses.
    const cap = Math.max(line.max_quantity, line.quantity);
    return setLineQuantity(
      cart,
      variantId,
      Math.min(line.quantity + quantity, cap),
    );
  }
  if (!preview) return cart;
  return withTotals([
    ...cart.items,
    {
      ...preview,
      quantity,
      added_at: new Date().toISOString(),
      available: true,
      line_total: preview.price * quantity,
      max_quantity: Math.min(preview.stock, MAX_LINE_QUANTITY),
    },
  ]);
}

export const EMPTY_CART: Cart = withTotals([]);

/**
 * Units in the bag, ready or not: what the badge and headings count, so a
 * line that needs attention doesn't make the bag look empty.
 */
export function unitCount(cart: Cart | undefined): number {
  return cart?.items.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
}

/** "Black · M" from a line's options. */
export function optionSummary(line: Pick<CartLine, "options">): string {
  return line.options.map((o) => o.value).join(" · ");
}
