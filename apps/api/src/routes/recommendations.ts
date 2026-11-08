import {
  boughtTogether,
  featuredProducts,
  similarProducts,
  type StorefrontProduct,
} from "../db/gen";
import type { Deps } from "../deps";
import { isUuid, query } from "../http/params";
import { fail, ok } from "../http/response";
import type { Group } from "../http/router";

// Suggestions next to a bag: what people also bought with its products,
// else similar products (same categories), else the featured ones. The
// source comes back with them, so the page can title them truthfully.

/** How many to suggest, and the fewest that make a source worth showing. */
const LIMIT = 4;
const ENOUGH = 2;
const MAX_IDS = 20;

export function recommendationRoutes(api: Group, deps: Deps) {
  const { db } = deps;

  api.get("/recommendations", async (req, res) => {
    const raw = query(req, "product_ids");
    const ids = [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length > MAX_IDS || !ids.every(isUuid)) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        `product_ids takes up to ${MAX_IDS} comma-separated product ids`,
      );
      return;
    }

    const params = { product_ids: ids, page_limit: LIMIT };
    const sources: [string, () => Promise<StorefrontProduct[]>][] = [
      ["bought_together", () => boughtTogether(db, params)],
      ["similar", () => similarProducts(db, params)],
    ];
    // Without products there's nothing to relate to: straight to featured.
    if (ids.length > 0) {
      for (const [source, find] of sources) {
        const products = await find();
        if (products.length >= ENOUGH) {
          ok(res, 200, "Recommendations fetched", { source, products });
          return;
        }
      }
    }
    ok(res, 200, "Recommendations fetched", {
      source: "featured",
      products: await featuredProducts(db, params),
    });
  });
}
