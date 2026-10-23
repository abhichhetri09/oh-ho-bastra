import type { Request, Response } from "express";
import { z } from "zod";
import { MAX_LINE_QUANTITY, type ErrorCode } from "@repo/types";
import {
  clearCart,
  countCartItems,
  deleteCartItem,
  ensureCart,
  getCartItemQuantity,
  getCartLines,
  getVariantAvailability,
  setCartItemQuantity,
  type GetCartLinesRow,
} from "../db/gen";
import { withTx, type Tx } from "../db/pool";
import type { Deps } from "../deps";
import { requireAuth } from "../http/middleware";
import { isUuid, pathUuid, userId } from "../http/params";
import { fail, internal, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { goInt, goRequired } from "./validation";

// The signed-in user's cart: one per user, created on first use. Prices are
// live (variant_prices); the cart never reserves stock, checkout does.

/** Caps one line (the body's quantity max). */
export const MAX_LINE = MAX_LINE_QUANTITY;
/**
 * Caps the distinct variants in a cart, which keeps GET /cart small enough
 * to return whole.
 */
export const MAX_CART_LINES = 50;

/** A refusal the handler turns into an error response. */
export class CartError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** What the add and update rules need to know about a variant. */
export interface Availability {
  stock: number;
  available: boolean;
}

const unavailable = () =>
  new CartError(409, "VARIANT_UNAVAILABLE", "This item is no longer available");
const itemNotFound = () =>
  new CartError(404, "CART_ITEM_NOT_FOUND", "This item is not in your bag");

function insufficient(stock: number, inCart: number): CartError {
  let message = "This item is out of stock";
  if (stock > 0 && inCart > 0)
    message = `Only ${stock} left, and ${inCart} already in your bag`;
  else if (stock > 0) message = `Only ${stock} left`;
  return new CartError(409, "INSUFFICIENT_STOCK", message);
}

/**
 * Whether `add` more of a variant fit, with `existing` already in the cart
 * (0 for a new line) and `lines` lines in it.
 */
export function checkAdd(
  existing: number,
  add: number,
  lines: number,
  v: Availability,
): CartError | null {
  if (!v.available) return unavailable();
  if (existing === 0 && lines >= MAX_CART_LINES) {
    return new CartError(
      409,
      "CART_FULL",
      `Your bag can hold ${MAX_CART_LINES} different items`,
    );
  }
  const next = existing + add;
  if (next > MAX_LINE)
    return new CartError(
      409,
      "CART_QUANTITY_LIMIT",
      `You can add up to ${MAX_LINE} of an item`,
    );
  if (next > v.stock) return insufficient(v.stock, existing);
  return null;
}

/**
 * Whether a line can go from `current` to `next`. Lowering always works, so
 * a line that went short or off sale can be fixed; raising needs the variant
 * on sale with enough stock.
 */
export function checkUpdate(
  current: number,
  next: number,
  v: Availability,
): CartError | null {
  if (next <= current) return null;
  if (!v.available) return unavailable();
  if (next > v.stock) return insufficient(v.stock, 0);
  return null;
}

/** The lines priced, and totals over what can be checked out. */
export function buildCart(rows: GetCartLinesRow[]) {
  const cart = {
    items: [] as (GetCartLinesRow & {
      line_total: number;
      max_quantity: number;
    })[],
    item_count: 0,
    subtotal: 0,
    has_issues: false,
  };
  for (const row of rows) {
    cart.items.push({
      ...row,
      line_total: row.price * row.quantity,
      max_quantity: row.available ? Math.min(row.stock, MAX_LINE) : 0,
    });
    if (!row.available || row.quantity > row.stock) {
      cart.has_issues = true;
      continue;
    }
    cart.item_count += row.quantity;
    cart.subtotal += row.price * row.quantity;
  }
  return cart;
}

// Mirrors types.AddCartItemRequest / UpdateCartItemRequest. Go's uuid
// rule takes any 8-4-4-4-12 hex id, not only RFC versions/variants.
const Quantity = goInt("Quantity", 1, MAX_LINE);
const AddBody = z.object({
  variant_id: goRequired("Variant id").refine(isUuid, {
    message: "Variant id must be a valid ID",
    params: { code: "INVALID_UUID" },
  }),
  quantity: Quantity,
});
const UpdateBody = z.object({ quantity: Quantity });

export function cartRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const carts = api.group("/cart", requireAuth(cfg));

  /**
   * Sends the user's whole cart; every cart endpoint answers with it so
   * clients can replace their copy.
   */
  async function respond(req: Request, res: Response, message: string) {
    let rows;
    try {
      rows = await getCartLines(db, userId(req));
    } catch (err) {
      internal(req, res, "failed to fetch cart", err);
      return;
    }
    ok(res, 200, message, buildCart(rows));
  }

  /**
   * Runs fn in a transaction on the user's cart (created if needed), then
   * responds with the cart. ensureCart locks the cart row first, so one
   * user's concurrent cart writes run one after another and every check
   * sees the quantities the previous write left.
   */
  async function mutate(
    req: Request,
    res: Response,
    message: string,
    fn: (tx: Tx, cartId: string) => Promise<CartError | null | void>,
  ) {
    try {
      await withTx(db, async (tx) => {
        const cart = await ensureCart(tx, userId(req));
        if (!cart) throw new Error("ensure cart returned no row");
        const refusal = await fn(tx, cart.id);
        // A refusal rolls back, like Go's deferred Rollback.
        if (refusal) throw refusal;
      });
    } catch (err) {
      if (err instanceof CartError) {
        fail(res, err.status, err.code, err.message);
        return;
      }
      internal(req, res, "failed to update cart", err);
      return;
    }
    await respond(req, res, message);
  }

  /** A variant's stock and sale state; a variant that doesn't exist is a 404. */
  async function availability(
    tx: Tx,
    variantId: string,
  ): Promise<Availability> {
    const row = await getVariantAvailability(tx, variantId);
    if (!row)
      throw new CartError(
        404,
        "VARIANT_NOT_FOUND",
        "Product variant not found",
      );
    return { stock: row.stock, available: row.available };
  }

  /** The user's cart (empty without one). */
  carts.get("", (req, res) => respond(req, res, "Cart fetched"));

  /** Empties the cart. Clearing an empty cart succeeds. */
  carts.delete("", (req, res) =>
    mutate(req, res, "Bag cleared", async (tx, cartId) => {
      await clearCart(tx, cartId);
    }),
  );

  /** Adds a quantity of a variant, on top of any already in the cart. */
  carts.post("/items", async (req, res) => {
    const body = parseBody(AddBody, req, res);
    if (!body) return;
    const variantId = body.variant_id.toLowerCase();

    await mutate(req, res, "Added to your bag", async (tx, cartId) => {
      const v = await availability(tx, variantId);
      const existing =
        (
          await getCartItemQuantity(tx, {
            cart_id: cartId,
            variant_id: variantId,
          })
        )?.quantity ?? 0;
      const lines = (await countCartItems(tx, cartId))?.count ?? 0;
      const refusal = checkAdd(existing, body.quantity, lines, v);
      if (refusal) return refusal;
      await setCartItemQuantity(tx, {
        cart_id: cartId,
        variant_id: variantId,
        quantity: existing + body.quantity,
      });
    });
  });

  /** Sets a line's quantity. */
  carts.patch("/items/:variantID", async (req, res) => {
    const variantId = pathUuid(
      req,
      res,
      "variantID",
      "INVALID_VARIANT_ID",
      "variant ID",
    );
    if (!variantId) return;
    const body = parseBody(UpdateBody, req, res);
    if (!body) return;

    await mutate(req, res, "Bag updated", async (tx, cartId) => {
      const current = await getCartItemQuantity(tx, {
        cart_id: cartId,
        variant_id: variantId,
      });
      if (!current) return itemNotFound();
      const refusal = checkUpdate(
        current.quantity,
        body.quantity,
        await availability(tx, variantId),
      );
      if (refusal) return refusal;
      await setCartItemQuantity(tx, {
        cart_id: cartId,
        variant_id: variantId,
        quantity: body.quantity,
      });
    });
  });

  /** Deletes a line. */
  carts.delete("/items/:variantID", async (req, res) => {
    const variantId = pathUuid(
      req,
      res,
      "variantID",
      "INVALID_VARIANT_ID",
      "variant ID",
    );
    if (!variantId) return;

    await mutate(req, res, "Removed from your bag", async (tx, cartId) => {
      if (
        (await deleteCartItem(tx, {
          cart_id: cartId,
          variant_id: variantId,
        })) === 0
      )
        return itemNotFound();
    });
  });
}
