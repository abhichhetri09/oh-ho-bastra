import type { Request, Response } from "express";
import {
  addWishlistItem,
  countWishlistItems,
  countWishlistProducts,
  listWishlistIDs,
  listWishlistProducts,
  removeWishlistItem,
  storefrontProductExists,
} from "../db/gen";
import type { Deps } from "../deps";
import { requireAuth } from "../http/middleware";
import {
  checkPageInRange,
  offset,
  parsePage,
  pathUuid,
  userId,
} from "../http/params";
import { fail, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";

// The signed-in user's saved products.

/** Caps a wishlist, so GET /wishlist/ids can return it whole. */
export const MAX_WISHLIST_ITEMS = 200;
const PAGE_SIZE = 24;

const productParam = (req: Request, res: Response) =>
  pathUuid(req, res, "productID", "INVALID_PRODUCT_ID", "product ID");

export function wishlistRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const w = api.group("/wishlist", requireAuth(cfg));

  /** The saved products still on sale, newest saved first. */
  w.get("", async (req, res) => {
    const uid = userId(req);
    const page = parsePage(req, res);
    if (page === null) return;
    const total = (await countWishlistProducts(db, uid))?.count ?? 0;
    if (!checkPageInRange(res, page, total, PAGE_SIZE)) return;
    const items =
      total > 0
        ? await listWishlistProducts(db, {
            user_id: uid,
            limit: PAGE_SIZE,
            offset: offset(page, PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Wishlist fetched",
      items,
      paginationMeta(total, page, PAGE_SIZE),
    );
  });

  /** Every saved product id, for showing hearts anywhere products are. */
  w.get("/ids", async (req, res) => {
    const rows = await listWishlistIDs(db, userId(req));
    ok(
      res,
      200,
      "Wishlist fetched",
      rows.map((r) => r.product_id),
    );
  });

  /** Saves a product on sale. Saving it again changes nothing. */
  w.put("/:productID", async (req, res) => {
    const uid = userId(req);
    const productId = productParam(req, res);
    if (!productId) return;
    if (!(await storefrontProductExists(db, productId))?.exists) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    // Not transactional: two racing adds can overshoot the cap by one,
    // which is harmless, while ON CONFLICT keeps rows unique.
    const count = (await countWishlistItems(db, uid))?.count ?? 0;
    if (count >= MAX_WISHLIST_ITEMS) {
      fail(
        res,
        409,
        "WISHLIST_FULL",
        `Your wishlist is full (${MAX_WISHLIST_ITEMS} items)`,
      );
      return;
    }
    await addWishlistItem(db, { user_id: uid, product_id: productId });
    ok(res, 200, "Saved to your wishlist");
  });

  /** Unsaves a product. Removing one that isn't saved succeeds. */
  w.delete("/:productID", async (req, res) => {
    const productId = productParam(req, res);
    if (!productId) return;
    await removeWishlistItem(db, {
      user_id: userId(req),
      product_id: productId,
    });
    ok(res, 200, "Removed from your wishlist");
  });
}
