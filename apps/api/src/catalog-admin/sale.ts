import type { Response } from "express";
import { endVariantsSale, getCategoryByID, putVariantsOnSale } from "../db/gen";
import { withTx, type Tx } from "../db/pool";
import type { Deps } from "../deps";
import { fail, ok } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { EndSaleBody, PutOnSaleBody, type SaleScope } from "./schemas";

// Mass sales: one percentage off many products at once. A sale is no new
// kind of price, just each variant's own offer (offer_price and
// offer_expires_at) written in bulk, so the storefront, the bag and checkout
// price it like an offer set in the editor, and the editor can change it
// afterwards variant by variant.

/** The query parameters that pick a scope's products. */
const scopeParams = (scope: SaleScope) => ({
  all_products: scope.kind === "all",
  product_ids: scope.kind === "products" ? scope.ids : [],
  category_id: scope.kind === "category" ? scope.id : null,
  include_subcategories: scope.kind === "category" && scope.subcategories,
});

/**
 * Runs a sale write in a transaction, after checking that a category
 * target exists: an unknown one would otherwise just change nothing. Unknown
 * product ids are only left out of the counts, like products deleted while
 * the admin was choosing.
 */
async function saleWrite(
  deps: Deps,
  res: Response,
  scope: SaleScope,
  write: (tx: Tx) => Promise<{ products: number; variants: number } | null>,
) {
  return withTx(deps.db, async (tx) => {
    if (scope.kind === "category" && !(await getCategoryByID(tx, scope.id))) {
      fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
      return null;
    }
    return (await write(tx)) ?? { products: 0, variants: 0 };
  });
}

export function adminSaleRoutes(sale: Group, deps: Deps) {
  /**
   * Puts the target's products on sale: every variant (active or not) gets
   * percent_off off its selling price, rounded to the cent, as its offer
   * until ends_at, replacing any offer it had.
   */
  sale.post("", async (req, res) => {
    const body = parseBody(PutOnSaleBody, req, res);
    if (!body) return;
    const counts = await saleWrite(deps, res, body.target, (tx) =>
      putVariantsOnSale(tx, {
        ...scopeParams(body.target),
        percent_off: body.percent_off,
        ends_at: body.ends_at ?? null,
      }),
    );
    if (counts) ok(res, 200, "Products put on sale", counts);
  });

  /** Ends the sale of the target's products: their offers are cleared. */
  sale.post("/end", async (req, res) => {
    const body = parseBody(EndSaleBody, req, res);
    if (!body) return;
    const counts = await saleWrite(deps, res, body.target, (tx) =>
      endVariantsSale(tx, scopeParams(body.target)),
    );
    if (counts) ok(res, 200, "Sale ended", counts);
  });
}
