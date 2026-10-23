import type { Request, Response } from "express";
import { CategoryBodySchema } from "@repo/types";
import {
  categorySlugExists,
  createCategory,
  createSubCategory,
  deleteCategory,
  getCategoriesCount,
  getCategoryAncestors,
  getCategoryByID,
  getCategoryTree,
  getPaginatedCategories,
  updateCategory,
} from "../db/gen";
import {
  FOREIGN_KEY_VIOLATION,
  pgCode,
  pgConstraint,
  UNIQUE_VIOLATION,
} from "../db/pool";
import type { Deps } from "../deps";
import { checkPageInRange, offset, parsePage, pathUuid } from "../http/params";
import { fail, internal, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { requireAuth, requireRole } from "../http/middleware";
import { slugify, slugMatches, slugWithSuffix } from "../lib/text";
import { rlog } from "../log";

const PAGE_LIMIT = 20;

/** Raised by the categories_no_cycle trigger (migration 000004). */
const CYCLE_CONSTRAINT = "categories_no_cycle";

export function categoryRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;

  const admin = api.group(
    "/admin/categories",
    requireAuth(cfg),
    requireRole("admin"),
  );

  /**
   * name slugified, with a random suffix when another category has the
   * slug. A category keeps its current slug while its name still
   * slugifies to it.
   */
  async function uniqueSlug(name: string, current = ""): Promise<string> {
    const slug = slugify(name);
    if (current && slugMatches(current, slug)) return current;
    return (await categorySlugExists(db, slug))?.exists
      ? slugWithSuffix(slug)
      : slug;
  }

  admin.post("", async (req: Request, res: Response) => {
    const body = parseBody(CategoryBodySchema, req, res);
    if (!body) return;

    const slug = await uniqueSlug(body.name);
    try {
      if (body.parent_id) {
        const parentId = body.parent_id.toLowerCase();
        if (!(await getCategoryByID(db, parentId))) {
          rlog.warn(req, "parent category not found", { parent_id: parentId });
          fail(res, 404, "CATEGORY_NOT_FOUND", "Parent category not found");
          return;
        }
        const category = await createSubCategory(db, {
          name: body.name,
          slug,
          parent_id: parentId,
        });
        ok(res, 201, "Subcategory created", category);
        return;
      }
      const category = await createCategory(db, { name: body.name, slug });
      ok(res, 201, "Category created", category);
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION) {
        fail(res, 409, "CATEGORY_ALREADY_EXISTS", "Category already exists");
      } else if (pgCode(err) === FOREIGN_KEY_VIOLATION) {
        // parent deleted between the check and the insert
        fail(res, 404, "CATEGORY_NOT_FOUND", "Parent category not found");
      } else {
        internal(req, res, "failed to create category", err);
      }
    }
  });

  /**
   * Renames and places a category. Like every PUT it replaces the whole
   * resource: an omitted parent_id makes it a root category.
   */
  admin.put("/:id", async (req, res) => {
    const categoryId = pathUuid(
      req,
      res,
      "id",
      "INVALID_CATEGORY_ID",
      "category ID",
    );
    if (!categoryId) return;
    const body = parseBody(CategoryBodySchema, req, res);
    if (!body) return;

    const category = await getCategoryByID(db, categoryId);
    if (!category) {
      fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
      return;
    }
    const slug = await uniqueSlug(body.name, category.slug);
    const parentId = body.parent_id?.toLowerCase() ?? null;

    // A root has no ancestors to check.
    if (parentId && parentId !== category.parent_id) {
      if (parentId === categoryId) {
        fail(
          res,
          400,
          "SELF_REFERENCING_CATEGORY",
          "A category cannot be its own parent",
        );
        return;
      }
      // The new parent's ancestor chain (which includes the parent itself)
      // must not contain this category, or the tree would become a cycle.
      const ancestors = await getCategoryAncestors(db, parentId);
      if (ancestors.length === 0) {
        rlog.warn(req, "parent category not found", { parent_id: parentId });
        fail(res, 404, "CATEGORY_NOT_FOUND", "Parent category not found");
        return;
      }
      if (ancestors.some((a) => a.id === categoryId)) {
        fail(
          res,
          400,
          "CYCLIC_CATEGORY_REFERENCE",
          "Assigning this parent would create a circular reference",
        );
        return;
      }
    }

    try {
      const updated = await updateCategory(db, {
        name: body.name,
        slug,
        parent_id: parentId,
        id: categoryId,
      });
      if (!updated) {
        // deleted between the read and the update
        fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
        return;
      }
      ok(res, 200, "Category updated", updated);
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION) {
        fail(res, 409, "CATEGORY_ALREADY_EXISTS", "Category already exists");
      } else if (pgConstraint(err) === CYCLE_CONSTRAINT) {
        // a concurrent move made this one cyclic
        fail(
          res,
          400,
          "CYCLIC_CATEGORY_REFERENCE",
          "Assigning this parent would create a circular reference",
        );
      } else if (pgCode(err) === FOREIGN_KEY_VIOLATION) {
        // parent deleted between the check and the update
        fail(res, 404, "CATEGORY_NOT_FOUND", "Parent category not found");
      } else {
        internal(req, res, "failed to update category", err, {
          category_id: categoryId,
        });
      }
    }
  });

  /**
   * Deletes a category; its subcategories and products keep existing with a
   * NULL parent/category (ON DELETE SET NULL).
   */
  admin.delete("/:id", async (req, res) => {
    const categoryId = pathUuid(
      req,
      res,
      "id",
      "INVALID_CATEGORY_ID",
      "category ID",
    );
    if (!categoryId) return;
    if ((await deleteCategory(db, categoryId)) === 0) {
      fail(res, 404, "CATEGORY_NOT_FOUND", "Category not found");
      return;
    }
    ok(res, 200, "Category deleted");
  });

  admin.get("", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const total = (await getCategoriesCount(db))?.count ?? 0;
    if (!checkPageInRange(res, page, total, PAGE_LIMIT)) return;
    const categories =
      total > 0
        ? await getPaginatedCategories(db, {
            limit: PAGE_LIMIT,
            offset: offset(page, PAGE_LIMIT),
          })
        : [];
    ok(
      res,
      200,
      "Categories fetched",
      categories,
      paginationMeta(total, page, PAGE_LIMIT),
    );
  });

  /**
   * Every category with its depth, parents before children, so the
   * storefront can build its navigation tree. Not paginated: the tree is
   * small and needed whole.
   */
  api.get("/categories", async (_req, res) => {
    ok(res, 200, "Categories fetched", await getCategoryTree(db));
  });
}
