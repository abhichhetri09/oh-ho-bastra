import {
  CouponIssueCodeSchema,
  type CartCoupon,
  type CouponIssueCode,
  type CouponKind,
} from "@repo/types";

// Discount codes on the bag. The API checks a code and works out its
// discount on every cart answer; these copies only reprice optimistic
// updates until it does.

/**
 * What a code takes off a subtotal in cents, as the API works it out
 * (apps/api/src/coupons/coupons.ts discountFor): a percentage rounded
 * down, or a fixed amount up to the whole subtotal.
 */
export function couponDiscount(
  kind: CouponKind,
  value: number,
  subtotal: number,
): number {
  if (subtotal <= 0) return 0;
  if (kind === "percent") return Math.floor((subtotal * value) / 100);
  return Math.min(value, subtotal);
}

/**
 * The bag's code against a new subtotal. A code with an issue stays at 0
 * (the API's answer says whether a change fixed it).
 */
export function repriceCoupon(
  coupon: CartCoupon | null,
  subtotal: number,
): CartCoupon | null {
  if (!coupon || coupon.issue || !coupon.kind || coupon.value === null)
    return coupon && { ...coupon, discount: 0 };
  return {
    ...coupon,
    discount: couponDiscount(coupon.kind, coupon.value, subtotal),
  };
}

/** "10% off" or "€5 off", for the applied code. */
export function couponSummary(
  coupon: Pick<CartCoupon, "kind" | "value">,
  formatAmount: (cents: number) => string,
): string {
  if (!coupon.kind || coupon.value === null) return "";
  return coupon.kind === "percent"
    ? `${coupon.value}% off`
    : `${formatAmount(coupon.value)} off`;
}

/** Whether an error code is checkout refusing the bag's discount code. */
export function isCouponIssue(
  code: string | undefined,
): code is CouponIssueCode {
  return CouponIssueCodeSchema.safeParse(code).success;
}

/**
 * Checkout's refusal of the bag's code, worded for the checkout page: the
 * API's reason, and what to do about it.
 */
export function couponRefusalMessage(code: string, reason: string): string {
  return `Your code ${code} can't be used: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}. Remove it from your bag, or change your bag, to check out.`;
}
