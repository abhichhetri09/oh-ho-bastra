import { randomInt } from "node:crypto";
import {
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
  type ReferralIssueCode,
  type ReferralRule,
} from "@repo/types";
import { referralRuleOf } from "../catalog/settings";
import { Refusal } from "../checkout/refusal";
import { CURRENCY } from "../checkout/shipping";
import { discountFor, normalizeEmail } from "../coupons/coupons";
import {
  countActiveReferralsForEmail,
  countPriorOrders,
  createReferralCode,
  getReferralCode,
  getReferralRule,
  getReferrerByCode,
  type GetReferrerByCodeRow,
} from "../db/gen";
import type { Queryable } from "../db/queryable";
import { formatMoney } from "../emails/render";

// Referrals: each customer's code, and whether a friend's bag can use one
// and what it takes off. One check serves the bag (every read of the cart)
// and checkout, as a discount code's does. The rule is the store's as of
// now (Admin → Settings → Referrals); a referral keeps it once made.

/** The programme as of now. The settings row is seeded by its migration. */
export async function loadReferralRule(db: Queryable): Promise<ReferralRule> {
  const row = await getReferralRule(db);
  if (!row) throw new Error("get referral rule: no rows in result set");
  return referralRuleOf(row);
}

// No 0/O or 1/I, so a code read out loud or copied by hand still works.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random 8-character code. */
export function newReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * The customer's code, made the first time they ask: it never changes, so
 * a link they shared keeps working. A clash with another code tries again.
 */
export async function referralCodeFor(
  db: Queryable,
  userId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getReferralCode(db, userId);
    if (existing) return existing.code;
    const created = await createReferralCode(db, {
      user_id: userId,
      code: newReferralCode(),
    });
    if (created) return created.code;
  }
  throw new Error("referral code: no free code after 5 tries");
}

/** What a line needs for the friend's discount. */
export interface DiscountLine {
  price: number;
  quantity: number;
  custom_print: boolean;
}

/**
 * The part of a bag the friend's discount counts: every line, or all but
 * the custom prints when the rule leaves them out.
 */
export function referralBase(
  lines: DiscountLine[],
  customPrints: boolean,
): number {
  return lines
    .filter((line) => customPrints || !line.custom_print)
    .reduce((sum, line) => sum + line.price * line.quantity, 0);
}

/**
 * What the friend's discount takes off base, in cents: a percentage rounded
 * down, or an amount up to the whole base (as a discount code's does).
 */
export const friendDiscount = (
  rule: Pick<ReferralRule, "friend_kind" | "friend_value">,
  base: number,
) =>
  discountFor(
    rule.friend_kind === "percent" ? "percent" : "fixed",
    rule.friend_value,
    base,
  );

/** What the check needs to know about the bag and who is buying it. */
export interface ReferralCheck {
  userId: string;
  /** The buyer's email, or null while it isn't known (a guest's bag before checkout). */
  email: string | null;
  /** The bag's subtotal after sale prices (friend_min counts it). */
  subtotal: number;
  /** The lines that can be checked out. */
  lines: DiscountLine[];
}

const refusal = (code: ReferralIssueCode, message: string) =>
  new Refusal(409, code, message);

// A code that is unknown, or the programme being off, reads the same.
export const errReferralNotFound = new Refusal(
  404,
  "REFERRAL_NOT_FOUND",
  "This referral link isn't valid",
);
export const errReferralsOff = new Refusal(
  404,
  "REFERRAL_NOT_FOUND",
  "Referral offers aren't running right now",
);
export const errReferralOwnCode = refusal(
  "REFERRAL_OWN_CODE",
  "You can't use your own referral link",
);
export const errReferralNotFirstOrder = refusal(
  "REFERRAL_NOT_FIRST_ORDER",
  "A friend's discount is for a first order",
);
export const errReferralMinSubtotal = (min: number) =>
  refusal(
    "REFERRAL_MIN_SUBTOTAL",
    `The friend's discount needs a subtotal of ${formatMoney(min, CURRENCY)} or more`,
  );

/** A referral code checked against a bag. */
export interface ReferralResult {
  rule: ReferralRule;
  /** null when no customer has the code (or the programme is off). */
  referrer: GetReferrerByCodeRow | null;
  /** cents; 0 when refused */
  discount: number;
  refusal: Refusal | null;
}

/**
 * Checks a code (as typed or linked) against a bag. A friend is someone
 * without a paid order, by account or email, who hasn't been referred
 * already, and isn't the referrer. The rules the bag can't fix come first.
 */
export async function evaluateReferral(
  db: Queryable,
  code: string,
  check: ReferralCheck,
): Promise<ReferralResult> {
  const rule = await loadReferralRule(db);
  const normalized = normalizeReferralCode(code);
  const referrer =
    rule.enabled && REFERRAL_CODE_PATTERN.test(normalized)
      ? await getReferrerByCode(db, normalized)
      : null;
  const email = check.email === null ? null : normalizeEmail(check.email);
  const why = await (async () => {
    if (!rule.enabled) return errReferralsOff;
    if (!referrer) return errReferralNotFound;
    if (referrer.id === check.userId || referrer.email === email)
      return errReferralOwnCode;
    const prior = await countPriorOrders(db, {
      user_id: check.userId,
      email: email ?? "",
    });
    if ((prior?.count ?? 0) > 0) return errReferralNotFirstOrder;
    if (email !== null) {
      const referred = await countActiveReferralsForEmail(db, email);
      if ((referred?.count ?? 0) > 0) return errReferralNotFirstOrder;
    }
    if (rule.friend_min !== null && check.subtotal < rule.friend_min)
      return errReferralMinSubtotal(rule.friend_min);
    return null;
  })();
  return {
    rule,
    referrer,
    discount: why
      ? 0
      : friendDiscount(rule, referralBase(check.lines, rule.custom_prints)),
    refusal: why,
  };
}

/** "a***@example.com": enough for the referrer to tell friends apart. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
