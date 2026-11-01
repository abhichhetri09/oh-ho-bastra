import type { ReferralFriendKind, ReferralRule } from "@repo/types";
import type { GetStoreSettingsRow } from "../db/gen";
import { shippingRuleOf } from "../checkout/shipping";

/**
 * The store_settings row as GET /settings and the admin's saves send it
 * (StoreSettings): as it is, with the delivery price and the referral
 * programme as one object each.
 */
export function storeSettings({
  shipping_flat,
  free_shipping_from,
  free_shipping_items,
  referrals_enabled,
  referral_friend_kind,
  referral_friend_value,
  referral_friend_min,
  referral_reward,
  referral_pay_after_days,
  referral_custom_prints,
  referral_monthly_cap,
  credit_max_percent,
  credit_expiry_months,
  updated_at,
  ...row
}: GetStoreSettingsRow) {
  return {
    ...row,
    shipping: shippingRuleOf({
      shipping_flat,
      free_shipping_from,
      free_shipping_items,
    }),
    referrals: referralRuleOf({
      referrals_enabled,
      referral_friend_kind,
      referral_friend_value,
      referral_friend_min,
      referral_reward,
      referral_pay_after_days,
      referral_custom_prints,
      referral_monthly_cap,
      credit_max_percent,
      credit_expiry_months,
    }),
    updated_at,
  };
}

/** The referral programme as store_settings holds it. */
export const referralRuleOf = (row: {
  referrals_enabled: boolean;
  referral_friend_kind: string;
  referral_friend_value: number;
  referral_friend_min: number | null;
  referral_reward: number;
  referral_pay_after_days: number;
  referral_custom_prints: boolean;
  referral_monthly_cap: number | null;
  credit_max_percent: number;
  credit_expiry_months: number | null;
}): ReferralRule => ({
  enabled: row.referrals_enabled,
  // the column's CHECK holds it to the two kinds
  friend_kind: row.referral_friend_kind as ReferralFriendKind,
  friend_value: row.referral_friend_value,
  friend_min: row.referral_friend_min,
  reward: row.referral_reward,
  pay_after_days: row.referral_pay_after_days,
  custom_prints: row.referral_custom_prints,
  monthly_cap: row.referral_monthly_cap,
  credit_max_percent: row.credit_max_percent,
  credit_expiry_months: row.credit_expiry_months,
});
