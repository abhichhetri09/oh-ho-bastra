import type { Request, Response } from "express";
import {
  adminListVariants,
  adminProductsList,
  countAdminProducts,
  createProduct,
  deleteProduct,
  getProductByID,
  listProductImages,
  orderedImages,
  productSlugExists,
  updateProduct,
  type ListProductImagesRow,
} from "../db/gen";
import { FOREIGN_KEY_VIOLATION, pgCode, pgConstraint } from "../db/pool";
import type { Deps } from "../deps";
import {
  checkPageInRange,
  offset,
  parsePage,
  parseSort,
  pathUuid,
  query,
} from "../http/params";
import { fail, internal, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import {
  containsPattern,
  slugify,
  slugMatches,
  slugWithSuffix,
} from "../lib/text";
import { log } from "../log";
import type { Cloudinary } from "../services/cloudinary";
import { ProductBody, type ProductInput } from "./schemas";

// Port of internal/handlers/product/admin.

const PAGE_LIMIT = 20;

/** Bounds the q parameter. */
const MAX_ADMIN_SEARCH = 100;

/** The sortable fields and their natural direction. */
const PRODUCT_SORTS: Record<string, "asc" | "desc"> = {
  created: "desc",
  updated: "desc",
  name: "asc",
  price: "asc",
  stock: "asc",
};

const productId = (req: Request, res: Response) =>
  pathUuid(req, res, "productID", "INVALID_PRODUCT_ID", "product ID");

/** Maps a validated request onto the product columns. */
const productColumns = (b: ProductInput) => ({
  name: b.name,
  category_id: b.category_id.toLowerCase(),
  description: b.description,
  features: b.features ?? [], // the column is NOT NULL
  images: b.images,
  image_public_ids: b.image_public_ids,
  is_active: b.is_active,
  is_featured: b.is_featured,
});

/** A create/update failure: a vanished category is a 404, the rest a 500. */
function productError(req: Request, res: Response, err: unknown, msg: string) {
  if (
    pgCode(err) === FOREIGN_KEY_VIOLATION &&
    pgConstraint(err) === "products_category_id_fkey"
  ) {
    fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
    return;
  }
  internal(req, res, msg, err);
}

/**
 * The public ids safe to delete: our own uploads (see Cloudinary.owns),
 * once each, and none that a past order shows.
 */
export function deletableImages(
  cld: Cloudinary | null,
  images: ListProductImagesRow[],
  ordered: string[],
): string[] | null {
  if (!cld) return null;
  const keep = new Set(ordered);
  const seen = new Set<string>();
  let ids: string[] | null = null;
  for (const img of images) {
    if (
      keep.has(img.url) ||
      seen.has(img.public_id) ||
      !cld.owns(img.url, img.public_id)
    )
      continue;
    seen.add(img.public_id);
    (ids ??= []).push(img.public_id);
  }
  return ids;
}

/** Removes images from Cloudinary, best effort. */
async function deleteImages(cld: Cloudinary, publicIds: string[]) {
  for (const id of publicIds) {
    try {
      await cld.deleteImage(id);
    } catch (err) {
      log.warn("cloudinary: delete image", {
        public_id: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function adminProductRoutes(admin: Group, deps: Deps) {
  const { db, cloudinary } = deps;

  /**
   * name slugified, with a random suffix when another product has the
   * slug. A product keeps its current slug when the name still slugifies
   * to it.
   */
  async function productSlug(name: string, current = ""): Promise<string> {
    const slug = slugify(name);
    if (current && slugMatches(current, slug)) return current;
    return (await productSlugExists(db, slug))?.exists
      ? slugWithSuffix(slug)
      : slug;
  }

  admin.post("", async (req, res) => {
    const body = parseBody(ProductBody, req, res);
    if (!body) return;
    const slug = await productSlug(body.name);
    try {
      const product = await createProduct(db, {
        ...productColumns(body),
        slug,
      });
      ok(res, 201, "Product created", product);
    } catch (err) {
      productError(req, res, err, "failed to create product");
    }
  });

  /** Replaces every editable field of a product. */
  admin.put("/:productID", async (req, res) => {
    const id = productId(req, res);
    if (!id) return;
    const body = parseBody(ProductBody, req, res);
    if (!body) return;

    const product = await getProductByID(db, id);
    if (!product) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    const slug = await productSlug(body.name, product.slug);
    try {
      const updated = await updateProduct(db, {
        ...productColumns(body),
        id,
        slug,
      });
      if (!updated) {
        // deleted between the read and the update
        fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
        return;
      }
      ok(res, 200, "Product updated", updated);
    } catch (err) {
      productError(req, res, err, "failed to update product");
    }
  });

  /**
   * Deletes a product; its variants, options and cart items go with it (ON
   * DELETE CASCADE), and past orders keep their copy. Its images are then
   * removed from Cloudinary in the background, except those that past
   * orders still show.
   */
  admin.delete("/:productID", async (req, res) => {
    const id = productId(req, res);
    if (!id) return;

    const images = await listProductImages(db, id);
    const ordered = await orderedImages(
      db,
      images.map((img) => img.url),
    );
    if ((await deleteProduct(db, id)) === 0) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    const ids = deletableImages(
      cloudinary,
      images,
      ordered.map((r) => r.image),
    );
    if (ids) void deleteImages(cloudinary, ids);
    ok(res, 200, "Product deleted");
  });

  /**
   * Every product (active or not) for the admin table, newest first: q
   * searches names, status is active or inactive, and category narrows to a
   * category and its subcategories.
   */
  admin.get("", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;

    const q = query(req, "q").trim();
    if ([...q].length > MAX_ADMIN_SEARCH) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        "q must be at most 100 characters",
      );
      return;
    }
    let active: boolean | null;
    switch (query(req, "status")) {
      case "":
        active = null;
        break;
      case "active":
        active = true;
        break;
      case "inactive":
        active = false;
        break;
      default:
        fail(
          res,
          400,
          "INVALID_QUERY_PARAMETER",
          "status must be active or inactive",
        );
        return;
    }
    const category = query(req, "category");
    const sort = parseSort(req, res, PRODUCT_SORTS, "created");
    if (!sort) return;

    const filters = {
      name_pattern: q ? containsPattern(q) : null,
      active,
      category_slug: category || null,
    };
    const total = (await countAdminProducts(db, filters))?.count ?? 0;
    if (!checkPageInRange(res, page, total, PAGE_LIMIT)) return;
    const products =
      total > 0
        ? await adminProductsList(db, {
            ...filters,
            sort: sort.field,
            dir: sort.dir,
            page_limit: PAGE_LIMIT,
            page_offset: offset(page, PAGE_LIMIT),
          })
        : [];
    ok(
      res,
      200,
      "Products fetched",
      products,
      paginationMeta(total, page, PAGE_LIMIT),
    );
  });

  /** One product (active or not) for the admin editor. */
  admin.get("/:productID", async (req, res) => {
    const id = productId(req, res);
    if (!id) return;
    const product = await getProductByID(db, id);
    if (!product) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    ok(res, 200, "Product fetched", product);
  });

  /**
   * Every variant of a product, inactive ones included, default first, with
   * its options. A product has a handful, so it isn't paginated.
   */
  admin.get("/:productID/variants", async (req, res) => {
    const id = productId(req, res);
    if (!id) return;
    if (!(await getProductByID(db, id))) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return;
    }
    ok(res, 200, "Variants fetched", await adminListVariants(db, id));
  });
}
