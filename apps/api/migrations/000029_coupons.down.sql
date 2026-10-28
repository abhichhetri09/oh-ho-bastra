ALTER TABLE carts DROP COLUMN IF EXISTS coupon_code;
ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_discount_within_subtotal,
    DROP COLUMN IF EXISTS coupon_code,
    DROP COLUMN IF EXISTS discount;
DROP TABLE IF EXISTS coupon_redemptions;
DROP TABLE IF EXISTS coupons;
