DROP TABLE credit_redemptions;
DROP TABLE credit_ledger;
ALTER TABLE orders DROP COLUMN credit;
DROP TABLE referrals;
ALTER TABLE carts DROP COLUMN referral_code;
DROP TABLE referral_codes;
