import type { Response } from "express";
import {
  CouponActiveBodySchema,
  CouponBodySchema,
  type CouponBody,
} from "@repo/types";
import {
  adminGetCoupon,
  adminListCoupons,
  countCoupons,
  createCoupon,
  deleteUnusedCoupon,
  setCouponActive,
  updateCoupon,
  type CreateCouponParams,
} from "../db/gen";
import {
  FOREIGN_KEY_VIOLATION,
  pgCode,
  UNIQUE_VIOLATION,
  type Pool,
} from "../db/pool";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import { checkPageInRange, offset, parsePage, pathUuid } from "../http/params";
import { fail, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";
import { parseBody } from "../http/validate";

// Discount codes, for the admin: list them with their uses, create, change,
// switch on or off, and delete one nobody has used. The rules a code is
// checked by live in src/coupons.

const COUPONS_PAGE_SIZE = 20;

/** The row to write: optional fields cleared or at their defaults. */
const couponParams = (body: CouponBody): CreateCouponParams => ({
  code: body.code,
  kind: body.kind,
  value: body.value,
  min_subtotal: body.min_subtotal ?? 0,
  starts_at: body.starts_at ?? null,
  ends_at: body.ends_at ?? null,
  max_redemptions: body.max_redemptions ?? null,
  once_per_customer: body.once_per_customer ?? false,
  is_active: body.is_active ?? true,
});

/** A code another coupon has: a 409 on the field, for the form to show. */
function duplicateCode(res: Response, code: string) {
  res.status(409).json({
    success: false,
    message: "Another coupon has this code",
    code: "COUPON_ALREADY_EXISTS",
    errors: [
      {
        code: "DUPLICATE_ITEM",
        field: "code",
        message: `${code} is already a coupon's code`,
      },
    ],
  });
}

const notFound = (res: Response) =>
  fail(res, 404, "COUPON_NOT_FOUND", "Coupon not found");

/** Answers with the coupon and its uses, as the list shows it. */
async function respondCoupon(
  res: Response,
  db: Pool,
  id: string,
  status: number,
  message: string,
) {
  const coupon = await adminGetCoupon(db, id);
  if (!coupon) return notFound(res); // deleted in between
  ok(res, status, message, coupon);
}

export function adminCouponRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const admin = api.group(
    "/admin/coupons",
    requireAuth(cfg),
    requireRole("admin"),
  );

  /** Every coupon, newest first, with its uses. */
  admin.get("", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const total = (await countCoupons(db))?.count ?? 0;
    if (!checkPageInRange(res, page, total, COUPONS_PAGE_SIZE)) return;
    const rows =
      total > 0
        ? await adminListCoupons(db, {
            limit: COUPONS_PAGE_SIZE,
            offset: offset(page, COUPONS_PAGE_SIZE),
          })
        : [];
    ok(
      res,
      200,
      "Coupons fetched",
      rows,
      paginationMeta(total, page, COUPONS_PAGE_SIZE),
    );
  });

  admin.post("", async (req, res) => {
    const body = parseBody(CouponBodySchema, req, res);
    if (!body) return;
    let created;
    try {
      created = await createCoupon(db, couponParams(body));
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION)
        return duplicateCode(res, body.code);
      throw err;
    }
    if (!created) throw new Error("create coupon returned no row");
    await respondCoupon(res, db, created.id, 201, "Coupon created");
  });

  /**
   * Replaces a coupon. Orders keep the discount they got; bags holding the
   * code are checked against the new rules on their next read.
   */
  admin.put("/:couponID", async (req, res) => {
    const id = pathUuid(req, res, "couponID", "INVALID_COUPON_ID", "coupon ID");
    if (!id) return;
    const body = parseBody(CouponBodySchema, req, res);
    if (!body) return;
    let updated;
    try {
      updated = await updateCoupon(db, { id, ...couponParams(body) });
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION)
        return duplicateCode(res, body.code);
      throw err;
    }
    if (!updated) return notFound(res);
    await respondCoupon(res, db, id, 200, "Coupon updated");
  });

  /** Switches a code on or off; off, it reads to shoppers as no code at all. */
  admin.put("/:couponID/active", async (req, res) => {
    const id = pathUuid(req, res, "couponID", "INVALID_COUPON_ID", "coupon ID");
    if (!id) return;
    const body = parseBody(CouponActiveBodySchema, req, res);
    if (!body) return;
    if (!(await setCouponActive(db, { id, is_active: body.is_active })))
      return notFound(res);
    await respondCoupon(
      res,
      db,
      id,
      200,
      body.is_active ? "Coupon switched on" : "Coupon switched off",
    );
  });

  /**
   * Deletes a code nobody has used. One that was used stays, so its orders
   * keep their record: the admin switches it off instead.
   */
  admin.delete("/:couponID", async (req, res) => {
    const id = pathUuid(req, res, "couponID", "INVALID_COUPON_ID", "coupon ID");
    if (!id) return;
    const inUse = () =>
      fail(
        res,
        409,
        "COUPON_IN_USE",
        "This code has been used, so it can't be deleted. Switch it off instead.",
      );
    let deleted;
    try {
      deleted = await deleteUnusedCoupon(db, id);
    } catch (err) {
      // a checkout redeemed it between the check and the delete
      if (pgCode(err) === FOREIGN_KEY_VIOLATION) return inUse();
      throw err;
    }
    if (deleted === 0) {
      return (await adminGetCoupon(db, id)) ? inUse() : notFound(res);
    }
    ok(res, 200, "Coupon deleted");
  });
}
