-- Discount codes: a percentage or a fixed amount off the whole bag (sale
-- prices included), with optional limits. Codes are stored uppercased, so
-- matching them is case-insensitive.
CREATE TABLE coupons (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code              TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
    kind              TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
    -- percent: 1 to 100; fixed: cents
    value             INT NOT NULL CHECK (value > 0),
    -- the bag's subtotal (after sale prices) a code needs; 0 for any
    min_subtotal      INT NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
    -- open-ended when NULL
    starts_at         TIMESTAMPTZ,
    ends_at           TIMESTAMPTZ,
    -- across every customer; NULL for no limit
    max_redemptions   INT CHECK (max_redemptions > 0),
    -- once per email address
    once_per_customer BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT coupons_code_unique UNIQUE (code),
    CONSTRAINT coupons_percent_max CHECK (kind <> 'percent' OR value <= 100),
    CONSTRAINT coupons_window CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE INDEX coupons_created_idx ON coupons(created_at DESC);

CREATE TRIGGER coupons_updated_at
BEFORE UPDATE ON coupons
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per order that used a code, written with the pending order and
-- deleted when it is cancelled, so a code's uses are its rows (an unpaid
-- checkout holds its use until it is released). Refunded orders keep
-- theirs. A coupon with uses can't be deleted, only deactivated.
CREATE TABLE coupon_redemptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    order_id   UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    -- lowercased, for once_per_customer
    email      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions(coupon_id, email);

-- What the code took off the order, and the code as it was then.
-- total = subtotal - discount + shipping.
ALTER TABLE orders
    ADD COLUMN discount    INT NOT NULL DEFAULT 0 CHECK (discount >= 0),
    ADD COLUMN coupon_code TEXT,
    ADD CONSTRAINT orders_discount_within_subtotal CHECK (discount <= subtotal);

-- The code applied to the bag, checked again whenever the cart is read and
-- at checkout. Not a foreign key: a code deleted or renamed since shows in
-- the bag as no longer valid instead of vanishing.
ALTER TABLE carts ADD COLUMN coupon_code TEXT;
