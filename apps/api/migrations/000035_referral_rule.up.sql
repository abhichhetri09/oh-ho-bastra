-- The referral programme, edited in Admin → Settings → Referrals. Amounts
-- are cents; NULL is no limit. A friend's first order gets friend_value off
-- (an amount, or a percent) from friend_min; the referrer earns reward in
-- store credit once that order is pay_after_days old, at most monthly_cap
-- times a month. Credit pays up to credit_max_percent of an order and
-- lapses after credit_expiry_months. The programme starts off. Each
-- referral will keep the rule it was made under, so a change only applies
-- to referrals after it.
ALTER TABLE store_settings
    ADD COLUMN referrals_enabled       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN referral_friend_kind    TEXT NOT NULL DEFAULT 'amount'
        CHECK (referral_friend_kind IN ('amount', 'percent')),
    ADD COLUMN referral_friend_value   INT NOT NULL DEFAULT 500 CHECK (referral_friend_value > 0),
    ADD COLUMN referral_friend_min     INT CHECK (referral_friend_min > 0),
    ADD COLUMN referral_reward         INT NOT NULL DEFAULT 500 CHECK (referral_reward > 0),
    ADD COLUMN referral_pay_after_days INT NOT NULL DEFAULT 30 CHECK (referral_pay_after_days >= 0),
    ADD COLUMN referral_custom_prints  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN referral_monthly_cap    INT CHECK (referral_monthly_cap > 0),
    ADD COLUMN credit_max_percent      INT NOT NULL DEFAULT 30
        CHECK (credit_max_percent BETWEEN 1 AND 100),
    ADD COLUMN credit_expiry_months    INT CHECK (credit_expiry_months > 0);
