import {
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
  type CartReferral,
  type ReferralOffer,
  type ReferralRule,
} from "@repo/types";
import { formatPriceShort } from "./money";

// The store's referral programme, as an admin sets it (Admin → Settings →
// Referrals) and GET /settings sends it, and the link a customer shares
// (/r/CODE, or any page with ?ref=CODE). The link leaves its code in a
// cookie, and the bag puts it on the cart (PUT /cart/referral), where the
// API checks it. Amounts are cents.

/** Holds a shared link's code until the bag uses it (readable by JS). */
export const REF_COOKIE = "ohb_ref";
/** How long a shared link's code waits for a first order: 30 days. */
export const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** A code from a link, normalised, or null when it can't be one. */
export function referralCodeFrom(raw: string | null | undefined) {
  if (!raw) return null;
  const code = normalizeReferralCode(raw);
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** The share link for a code, on origin. */
export const referralLink = (origin: string, code: string) =>
  `${origin.replace(/\/+$/, "")}/r/${code}`;

/** The programme the store starts with (store_settings' defaults). */
export const DEFAULT_REFERRALS: ReferralRule = {
  enabled: false,
  friend_kind: "amount",
  friend_value: 500,
  friend_min: null,
  reward: 500,
  pay_after_days: 30,
  custom_prints: false,
  monthly_cap: null,
  credit_max_percent: 30,
  credit_expiry_months: null,
};

/** The friend's discount in words: "€5", "10% off". */
function friendGets(rule: ReferralRule): string {
  return rule.friend_kind === "percent"
    ? `${rule.friend_value}% off`
    : formatPriceShort(rule.friend_value);
}

/** What a link gives a friend: "€5", "10%". */
export function friendOffer(
  offer: Pick<ReferralOffer, "friend_kind" | "friend_value">,
): string {
  return offer.friend_kind === "percent"
    ? `${offer.friend_value}%`
    : formatPriceShort(offer.friend_value);
}

/**
 * The welcome for a shopper who came through a link: "You've got €5 off
 * your first order from a friend", with "on orders over €40" when the
 * rule has a minimum.
 */
export function referralWelcome(offer: ReferralOffer): string {
  const min =
    offer.friend_min === null
      ? ""
      : ` on orders over ${formatPriceShort(offer.friend_min)}`;
  return `You've got ${friendOffer(offer)} off your first order from a friend${min}`;
}

/** The programme as a short perk: "Give €5, get €5", "Give 10% off, get €5". */
export function referralPerk(rule: ReferralRule): string {
  return `Give ${friendGets(rule)}, get ${formatPriceShort(rule.reward)}`;
}

/** The least Stripe charges (€0.50): credit never takes an order below it. */
const MIN_CHARGE = 50;

/**
 * The store credit checkout would use on a bag (apps/api's start): what's
 * available, up to maxPercent of the total, never past the items after the
 * discount, and never leaving less than Stripe's minimum to pay.
 */
export function creditFor(
  available: number,
  maxPercent: number,
  cart: { subtotal: number; discount: number; total: number },
): number {
  const share = Math.min(
    Math.floor((cart.total * maxPercent) / 100),
    cart.total - MIN_CHARGE,
  );
  return Math.max(Math.min(available, share, cart.subtotal - cart.discount), 0);
}

/** Where a friend's referral on the bag stands, for the bag's notice. */
export type ReferralNotice = {
  tone: "applied" | "issue" | "outdone";
  message: string;
};

/**
 * The bag's word on its referral: applied, why it doesn't apply (the
 * API's reason), or the bag's code taking off more (one discount per
 * order). Null without one.
 */
export function referralNotice(
  referral: CartReferral | null,
): ReferralNotice | null {
  if (!referral) return null;
  if (referral.applied)
    return { tone: "applied", message: "Friend's discount applied" };
  if (referral.issue) return { tone: "issue", message: referral.issue.message };
  return {
    tone: "outdone",
    message:
      "Your discount code takes off more than your friend's discount, so it's used instead (one discount per order)",
  };
}
