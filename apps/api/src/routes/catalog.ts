import type { Request, Response } from "express";
import { LISTING_PAGE_SIZE, parseListingQuery } from "../catalog/listing-query";
import { storeSettings } from "../catalog/settings";
import {
  countStorefrontProducts,
  getCategoryBySlug,
  getProductWithDefaultVariantBySlug,
  getRelatedProducts,
  getStorefrontFilterOptions,
  getStorefrontPriceRange,
  getStoreSettings,
  getVariantsByProductSlug,
  listStorefrontProducts,
  type StorefrontProduct,
} from "../db/gen";
import type { Deps } from "../deps";
import { checkPageInRange, offset } from "../http/params";
import { fail, internal, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { rlog } from "../log";

// The storefront's catalog: product listings, a product's page and the
// store-wide settings (port of internal/handlers/product/user and
// internal/handlers/settings).

export function catalogRoutes(api: Group, deps: Deps) {
  const { db } = deps;

  /**
   * One page of the visible products, with the filter options and price
   * range of everything in scope (unfiltered by price and options).
   * slug scopes it to a category and all its subcategories.
   */
  async function listing(req: Request, res: Response, slug: string | null) {
    const q = parseListingQuery(req, res);
    if (!q) return;

    const scope = {
      category_slug: slug,
      featured_only: q.featured,
      search_terms: q.searchTerms,
    };
    const filters = {
      ...scope,
      price_min: q.priceMin,
      price_max: q.priceMax,
      option_names: q.optionNames,
      option_values: q.optionValues,
    };

    let total: number;
    try {
      total = (await countStorefrontProducts(db, filters))?.count ?? 0;
    } catch (err) {
      internal(req, res, "failed to count products", err, { slug: slug ?? "" });
      return;
    }

    if (!checkPageInRange(res, q.page, total, LISTING_PAGE_SIZE)) return;

    let products: StorefrontProduct[];
    let filterOptions, priceRange;
    try {
      [products, filterOptions, priceRange] = await Promise.all([
        total > 0
          ? listStorefrontProducts(db, {
              ...filters,
              sort: q.sort,
              page_limit: LISTING_PAGE_SIZE,
              page_offset: offset(q.page, LISTING_PAGE_SIZE),
            })
          : [],
        getStorefrontFilterOptions(db, scope),
        getStorefrontPriceRange(db, scope),
      ]);
    } catch (err) {
      internal(req, res, "failed to list products", err, { slug: slug ?? "" });
      return;
    }
    if (!priceRange) {
      // an aggregate always has a row; Go's pgx.ErrNoRows would be a 500 too
      internal(
        req,
        res,
        "failed to list products",
        new Error("no rows in result set"),
        { slug: slug ?? "" },
      );
      return;
    }

    ok(
      res,
      200,
      "Products fetched",
      { products, filter_options: filterOptions, price_range: priceRange },
      paginationMeta(total, q.page, LISTING_PAGE_SIZE),
    );
  }

  /** Every visible product (active, with an active default variant). */
  api.get("/products", (req, res) => listing(req, res, null));

  /**
   * A visible product's detail page: the product with its default variant,
   * its active variants and up to 8 related products.
   */
  api.get("/products/:productSlug", async (req, res) => {
    const productSlug = String(req.params.productSlug);
    let detail, variants, related;
    try {
      [detail, variants, related] = await Promise.all([
        getProductWithDefaultVariantBySlug(db, productSlug),
        getVariantsByProductSlug(db, productSlug),
        getRelatedProducts(db, productSlug),
      ]);
    } catch (err) {
      internal(req, res, "failed to fetch product", err, { slug: productSlug });
      return;
    }
    if (!detail) {
      rlog.warn(req, "product not found", { slug: productSlug });
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    ok(res, 200, "Product fetched", {
      product_detail: detail,
      variants,
      related_products: related,
    });
  });

  /** The visible products of a category and all its subcategories. */
  api.get("/categories/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    let category;
    try {
      category = await getCategoryBySlug(db, slug);
    } catch (err) {
      internal(req, res, "failed to fetch category", err, { slug });
      return;
    }
    if (!category) {
      fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
      return;
    }
    await listing(req, res, slug);
  });

  /** The store's public settings (its theme, font and corners, banner, business details and delivery price). */
  api.get("/settings", async (req, res) => {
    let settings;
    try {
      settings = await getStoreSettings(db);
    } catch (err) {
      internal(req, res, "failed to load store settings", err);
      return;
    }
    if (!settings) {
      // the single row is seeded by the migration; Go's pgx.ErrNoRows was a 500
      internal(
        req,
        res,
        "failed to load store settings",
        new Error("no rows in result set"),
      );
      return;
    }
    ok(res, 200, "Store settings fetched", storeSettings(settings));
  });
}
