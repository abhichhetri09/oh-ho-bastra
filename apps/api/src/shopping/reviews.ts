import type { Request, Response } from "express";
import { z } from "zod";
import {
  adminListReviews,
  countAdminReviews,
  deleteReview,
  getMyReview,
  getStorefrontProductIDBySlug,
  hasBoughtProduct,
  listPublishedReviews,
  reviewDistribution,
  setReviewStatus,
  upsertReview,
  type ReviewDistributionRow,
} from "../db/gen";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import {
  checkPageInRange,
  offset,
  parsePage,
  pathUuid,
  query,
  userId,
} from "../http/params";
import { fail, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";
import { goInt, goRequired, goText } from "./validation";

// Product reviews. Only verified buyers (a paid order holds the product) can
// write one, once per product. The product's rating_avg/rating_count follow
// through a trigger that counts published reviews only.

const PAGE_SIZE = 10;
const ADMIN_PAGE_SIZE = 20;

// Mirrors types.ReviewRequest and types.ReviewStatus (see ./validation).
const ReviewBody = z.object({
  rating: goInt("Rating", 1, 5),
  title: goText("Title", 100),
  body: goText("Body", 2000),
});
const STATUSES = ["published", "hidden"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (s: string): s is Status =>
  (STATUSES as readonly string[]).includes(s);
const StatusBody = z.object({
  status: goRequired("Status").refine(isStatus, {
    message: "Status must be one of: published, hidden",
    params: { code: "INVALID_VALUE" },
  }),
});

/**
 * Per-star counts as an average (one decimal) and a fixed five-slot
 * distribution.
 */
export function summarise(rows: ReviewDistributionRow[]) {
  const s = { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  let sum = 0;
  for (const r of rows) {
    if (r.rating < 1 || r.rating > 5) continue;
    s.distribution[r.rating - 1] = r.count;
    s.count += r.count;
    sum += r.count * r.rating;
  }
  if (s.count > 0) s.average = Math.round((sum / s.count) * 10) / 10;
  return s;
}

/** A reviewer as their first name and last initial. */
export function displayName(full: string): string {
  const parts = full.split(/\s+/).filter(Boolean);
  const [first, last] = [parts[0], parts.at(-1)];
  if (first === undefined || last === undefined) return "A customer";
  if (parts.length === 1) return first;
  const initial = [...last][0] ?? "";
  const upper = initial.toUpperCase();
  // Go's unicode.ToUpper maps one rune to one rune.
  return `${first} ${[...upper].length === 1 ? upper : initial}.`;
}

export function reviewRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;

  /** The id of the product on sale with the path's slug, or null after a 404. */
  async function productId(
    req: Request,
    res: Response,
  ): Promise<string | null> {
    const row = await getStorefrontProductIDBySlug(
      db,
      String(req.params.productSlug),
    );
    if (!row) {
      fail(res, 404, "PRODUCT_NOT_FOUND", "Product not found");
      return null;
    }
    return row.id;
  }

  const bought = async (uid: string, product: string) =>
    (await hasBoughtProduct(db, { user_id: uid, product_id: product }))
      ?.exists ?? false;

  /** A product's published reviews, newest first, with a summary. */
  api.get("/products/:productSlug/reviews", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const id = await productId(req, res);
    if (!id) return;

    const summary = summarise(await reviewDistribution(db, id));
    if (!checkPageInRange(res, page, summary.count, PAGE_SIZE)) return;
    const rows =
      summary.count > 0
        ? await listPublishedReviews(db, {
            product_id: id,
            limit: PAGE_SIZE,
            offset: offset(page, PAGE_SIZE),
          })
        : [];
    const reviews = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: displayName(r.author_name),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    ok(
      res,
      200,
      "Reviews fetched",
      { summary, reviews },
      paginationMeta(summary.count, page, PAGE_SIZE),
    );
  });

  const mine = api.group("/products/:productSlug/reviews", requireAuth(cfg));

  /** Whether the user may review the product, and their review. */
  mine.get("/mine", async (req, res) => {
    const uid = userId(req);
    const id = await productId(req, res);
    if (!id) return;
    const canReview = await bought(uid, id);
    const review = await getMyReview(db, { product_id: id, user_id: uid });
    ok(res, 200, "Review fetched", { can_review: canReview, review });
  });

  /** Creates or edits the user's review; they must have bought the product. */
  mine.put("", async (req, res) => {
    const uid = userId(req);
    const body = parseBody(ReviewBody, req, res);
    if (!body) return;
    const id = await productId(req, res);
    if (!id) return;
    if (!(await bought(uid, id))) {
      fail(
        res,
        403,
        "NOT_VERIFIED_BUYER",
        "Only customers who bought this product can review it",
      );
      return;
    }
    const review = await upsertReview(db, {
      product_id: id,
      user_id: uid,
      rating: body.rating,
      title: body.title,
      body: body.body,
    });
    ok(res, 200, "Review saved", review);
  });

  /** Removes the user's review. */
  mine.delete("", async (req, res) => {
    const id = await productId(req, res);
    if (!id) return;
    if (
      (await deleteReview(db, { product_id: id, user_id: userId(req) })) === 0
    ) {
      fail(res, 404, "REVIEW_NOT_FOUND", "You haven't reviewed this product");
      return;
    }
    ok(res, 200, "Review deleted");
  });

  const admin = api.group(
    "/admin/reviews",
    requireAuth(cfg),
    requireRole("admin"),
  );

  /**
   * Every review, newest first, for moderation: status is published or
   * hidden, rating 1 to 5.
   */
  admin.get("", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;

    let status: string | null = null;
    const s = query(req, "status");
    if (s !== "") {
      if (!isStatus(s)) {
        fail(
          res,
          400,
          "INVALID_QUERY_PARAMETER",
          "status must be published or hidden",
        );
        return;
      }
      status = s;
    }
    let rating: number | null = null;
    const r = query(req, "rating");
    if (r !== "") {
      // strconv.Atoi: an optional sign and decimal digits
      const n = /^[+-]?\d+$/.test(r) ? Number(r) : NaN;
      if (!(n >= 1 && n <= 5)) {
        fail(res, 400, "INVALID_QUERY_PARAMETER", "rating must be 1 to 5");
        return;
      }
      rating = n;
    }

    const total = (await countAdminReviews(db, { status, rating }))?.count ?? 0;
    if (!checkPageInRange(res, page, total, ADMIN_PAGE_SIZE)) return;
    const reviews =
      total > 0
        ? await adminListReviews(db, {
            status,
            rating,
            page_limit: ADMIN_PAGE_SIZE,
            page_offset: offset(page, ADMIN_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Reviews fetched",
      reviews,
      paginationMeta(total, page, ADMIN_PAGE_SIZE),
    );
  });

  /**
   * Publishes or hides a review; the product's rating follows (the trigger
   * counts published reviews only).
   */
  admin.put("/:id/status", async (req, res) => {
    const id = pathUuid(req, res, "id", "INVALID_REVIEW_ID", "review ID");
    if (!id) return;
    const body = parseBody(StatusBody, req, res);
    if (!body) return;
    const review = await setReviewStatus(db, { id, status: body.status });
    if (!review) {
      fail(res, 404, "REVIEW_NOT_FOUND", "Review not found");
      return;
    }
    ok(
      res,
      200,
      body.status === "hidden" ? "Review hidden" : "Review published",
      review,
    );
  });
}
