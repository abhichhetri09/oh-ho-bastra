import {
  CouponBodySchema,
  type AdminCoupon,
  type CouponBody,
  type CouponKind,
} from "@repo/types";
import { friendlyFieldErrors } from "@/lib/forms";
import { formatPriceShort, fromCents, toCents } from "@/lib/money";
import { fromLocalInput, toLocalInput } from "./datetime";

// Discount codes in the admin: what state each is in, how its rules read in
// the table, and the edit form's values to and from the API's.

/** Where a coupon stands for shoppers right now. */
export type CouponStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "used-up"
  | "off";

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  "used-up": "Used up",
  off: "Off",
};

/** As the API checks a code (switched off first, then its dates, then its uses). */
export function couponStatus(c: AdminCoupon, now = new Date()): CouponStatus {
  if (!c.is_active) return "off";
  if (c.starts_at && new Date(c.starts_at) > now) return "scheduled";
  if (c.ends_at && new Date(c.ends_at) <= now) return "expired";
  if (c.max_redemptions !== null && c.redemptions >= c.max_redemptions)
    return "used-up";
  return "active";
}

/** The list's page from the url's ?page=, 1 for anything else. */
export function couponsPage(
  params: Record<string, string | string[] | undefined>,
): number {
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** "10% off" or "€5 off". */
export function couponValue(c: Pick<AdminCoupon, "kind" | "value">): string {
  return c.kind === "percent"
    ? `${c.value}% off`
    : `${formatPriceShort(c.value)} off`;
}

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Any time", "From 1 Nov 2026", "Until 30 Nov 2026" or both ends. */
export function couponWindow(
  c: Pick<AdminCoupon, "starts_at" | "ends_at">,
): string {
  const from = c.starts_at ? day.format(new Date(c.starts_at)) : null;
  const to = c.ends_at ? day.format(new Date(c.ends_at)) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "Any time";
}

/** "3 / 100", or "3" without a limit. */
export const couponUses = (
  c: Pick<AdminCoupon, "redemptions" | "max_redemptions">,
) =>
  c.max_redemptions === null
    ? String(c.redemptions)
    : `${c.redemptions} / ${c.max_redemptions}`;

/** The edit form, as typed. Amounts are euros ("4.50"), dates local. */
export interface CouponValues {
  code: string;
  kind: CouponKind;
  /** percent: "10"; fixed: euros */
  amount: string;
  /** euros; "" for none */
  minimum: string;
  /** datetime-local values; "" for open-ended */
  startsAt: string;
  endsAt: string;
  /** "" for no limit */
  maxUses: string;
  oncePerCustomer: boolean;
  isActive: boolean;
}

export const EMPTY_COUPON: CouponValues = {
  code: "",
  kind: "percent",
  amount: "",
  minimum: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  oncePerCustomer: false,
  isActive: true,
};

/** A coupon's values for editing it. */
export function couponValues(c: AdminCoupon): CouponValues {
  return {
    code: c.code,
    kind: c.kind,
    amount: c.kind === "percent" ? String(c.value) : fromCents(c.value),
    minimum: c.min_subtotal > 0 ? fromCents(c.min_subtotal) : "",
    startsAt: toLocalInput(c.starts_at),
    endsAt: toLocalInput(c.ends_at),
    maxUses: c.max_redemptions === null ? "" : String(c.max_redemptions),
    oncePerCustomer: c.once_per_customer,
    isActive: c.is_active,
  };
}

/**
 * The form's values as the API's body, or the errors to show by each field
 * (keyed by the body's field names).
 */
export function parseCouponValues(
  v: CouponValues,
):
  | { body: CouponBody; errors?: undefined }
  | { body?: undefined; errors: Record<string, string> } {
  const local: Record<string, string> = {};
  let value = NaN;
  if (v.kind === "percent") {
    if (/^\d+$/.test(v.amount.trim())) value = Number(v.amount);
    else local.value = "Enter a whole percentage, like 10";
  } else {
    value = toCents(v.amount) ?? NaN;
    if (Number.isNaN(value)) local.value = "Enter an amount, like 5 or 4.50";
  }
  const minimum = v.minimum.trim() ? toCents(v.minimum) : undefined;
  if (minimum === null) local.min_subtotal = "Enter an amount, like 50";
  if (v.maxUses.trim() && !/^\d+$/.test(v.maxUses.trim()))
    local.max_redemptions = "Enter a whole number";

  const parsed = CouponBodySchema.safeParse({
    code: v.code,
    kind: v.kind,
    value,
    ...(minimum ? { min_subtotal: minimum } : {}),
    starts_at: fromLocalInput(v.startsAt),
    ends_at: fromLocalInput(v.endsAt),
    ...(v.maxUses.trim() ? { max_redemptions: Number(v.maxUses) } : {}),
    once_per_customer: v.oncePerCustomer,
    is_active: v.isActive,
  });
  const errors = {
    ...(parsed.success
      ? {}
      : friendlyFieldErrors(parsed.error, {
          code: "a code",
          value: "an amount",
          max_redemptions: "a number of uses",
        })),
    ...local,
  };
  if (!parsed.success || Object.keys(errors).length > 0) return { errors };
  return { body: parsed.data };
}
