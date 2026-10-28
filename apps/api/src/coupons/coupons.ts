import {
  COUPON_CODE_PATTERN,
  normalizeCouponCode,
  type CouponIssueCode,
  type CouponKind,
} from "@repo/types";
import {
  createCouponRedemption,
  getCouponByCode,
  getCouponUsage,
  lockCouponByCode,
  type Coupon,
  type Order,
} from "../db/gen";
import type { Queryable } from "../db/queryable";
import { Refusal } from "../checkout/refusal";
import { CURRENCY } from "../checkout/shipping";
import { formatMoney } from "../emails/render";

// Discount codes: whether one can be used on a bag, and what it takes off.
// One check serves the bag (applying a code, and every read of the cart)
// and checkout, which runs it again under a lock on the code. It is keyed
// by the code, the subtotal and the customer's email, not by a user, so a
// guest's checkout can use it as it is.

/**
 * What a code takes off a subtotal (after sale prices), in cents: a
 * percentage rounded down, or a fixed amount up to the whole subtotal.
 */
export function discountFor(
  kind: CouponKind | string,
  value: number,
  subtotal: number,
): number {
  if (subtotal <= 0) return 0;
  if (kind === "percent") return Math.floor((subtotal * value) / 100);
  return Math.min(value, subtotal);
}

/** What the check needs to know about the bag and who is buying it. */
export interface CouponCheck {
  /** The bag's subtotal after sale prices, in cents. */
  subtotal: number;
  /**
   * The customer's email, or null while it isn't known (a guest's bag before
   * checkout): once_per_customer is then left to checkout.
   */
  email: string | null;
  now: Date;
}

/** A code's uses: all of them, and those by the customer's email. */
export interface CouponUsage {
  used: number;
  usedByEmail: number;
}

const refusal = (code: CouponIssueCode, message: string, status = 409) =>
  new Refusal(status, code, message);

// A code that is switched off or hasn't started reads as one that doesn't
// exist, so codes can't be found out before they go live.
export const errCouponNotFound = refusal(
  "COUPON_NOT_FOUND",
  "This code isn't valid",
  404,
);
export const errCouponExpired = refusal(
  "COUPON_EXPIRED",
  "This code has expired",
);
export const errCouponUsedUp = refusal(
  "COUPON_USED_UP",
  "This code has been used up",
);
export const errCouponAlreadyUsed = refusal(
  "COUPON_ALREADY_USED",
  "You've already used this code",
);
export const errCouponMinSubtotal = (minSubtotal: number) =>
  refusal(
    "COUPON_MIN_SUBTOTAL",
    `This code needs a subtotal of ${formatMoney(minSubtotal, CURRENCY)} or more`,
  );

/**
 * Why the code can't be used on this bag, or null when it can. The rules
 * that can't be fixed from the bag come first, so a shopper isn't asked to
 * spend more on a code that has run out.
 */
export function couponRefusal(
  coupon: Coupon | null,
  check: CouponCheck,
  usage: CouponUsage,
): Refusal | null {
  if (!coupon || !coupon.is_active) return errCouponNotFound;
  const now = check.now.getTime();
  if (coupon.starts_at && coupon.starts_at.getTime() > now)
    return errCouponNotFound;
  if (coupon.ends_at && coupon.ends_at.getTime() <= now)
    return errCouponExpired;
  if (coupon.max_redemptions !== null && usage.used >= coupon.max_redemptions)
    return errCouponUsedUp;
  if (coupon.once_per_customer && check.email !== null && usage.usedByEmail > 0)
    return errCouponAlreadyUsed;
  if (check.subtotal < coupon.min_subtotal)
    return errCouponMinSubtotal(coupon.min_subtotal);
  return null;
}

/** A code checked against a bag. */
export interface CouponResult {
  /** null when no coupon has the code. */
  coupon: Coupon | null;
  /** cents; 0 when refused */
  discount: number;
  refusal: Refusal | null;
}

/**
 * Checks a code (as typed: any case, spaces around it) against a bag.
 * With lock, the coupon row is locked for the rest of the caller's
 * transaction (checkout), so its uses can't change before the caller
 * records its own.
 */
export async function evaluateCoupon(
  db: Queryable,
  code: string,
  check: CouponCheck,
  { lock = false }: { lock?: boolean } = {},
): Promise<CouponResult> {
  const normalized = normalizeCouponCode(code);
  const coupon = COUPON_CODE_PATTERN.test(normalized)
    ? await (lock ? lockCouponByCode : getCouponByCode)(db, normalized)
    : null;
  const email = check.email === null ? null : normalizeEmail(check.email);
  let usage: CouponUsage = { used: 0, usedByEmail: 0 };
  // Uses only matter to a code with a limit (and a live one).
  if (
    coupon?.is_active &&
    (coupon.max_redemptions !== null || coupon.once_per_customer)
  ) {
    const row = await getCouponUsage(db, {
      coupon_id: coupon.id,
      email: email ?? "",
    });
    usage = { used: row?.used ?? 0, usedByEmail: row?.used_by_email ?? 0 };
  }
  const why = couponRefusal(coupon, { ...check, email }, usage);
  return {
    coupon,
    discount:
      why || !coupon
        ? 0
        : discountFor(coupon.kind, coupon.value, check.subtotal),
    refusal: why,
  };
}

/**
 * The code as checkout redeems it, inside its transaction: checked under a
 * lock on the coupon (which the caller holds until it commits, after
 * recordRedemption), so its last use, or a customer's only one, can't go
 * to two orders. A code that can't be used is a 409 with its reason, and
 * the caller creates nothing.
 */
export async function checkoutCoupon(
  tx: Queryable,
  code: string,
  check: CouponCheck,
): Promise<{ coupon: Coupon; discount: number }> {
  const { coupon, discount, refusal } = await evaluateCoupon(tx, code, check, {
    lock: true,
  });
  if (refusal || !coupon)
    throw new Refusal(
      409,
      refusal?.code ?? "COUPON_NOT_FOUND",
      refusal?.message ?? errCouponNotFound.message,
    );
  return { coupon, discount };
}

/** Records an order's use of a code (given back if the order is cancelled). */
export async function recordRedemption(
  tx: Queryable,
  coupon: Coupon,
  order: Pick<Order, "id" | "email">,
): Promise<void> {
  await createCouponRedemption(tx, {
    coupon_id: coupon.id,
    order_id: order.id,
    email: normalizeEmail(order.email),
  });
}

/** Emails are compared lowercased, as accounts store them. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
