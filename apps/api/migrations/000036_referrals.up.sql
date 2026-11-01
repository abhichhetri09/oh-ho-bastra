-- The referral programme at work (its rule is store_settings' referral_*
-- and credit_* columns): each customer's code, the referrals it brought,
-- and the store credit they earn, as an append-only ledger.

-- One code per customer, made the first time they look at it, so it never
-- changes once shared.
CREATE TABLE referral_codes (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{8}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The code a shared link put on the bag, checked again whenever the cart
-- is read and at checkout (as carts.coupon_code is).
ALTER TABLE carts ADD COLUMN referral_code TEXT;

-- A friend's first order made with a code. It keeps the rule it was made
-- under (friend_* to custom_prints), whatever the admin sets later. It is
-- written with the pending order: cancelled with it, pending until the
-- order is delivered and pay_after_days have passed, then earned (the
-- referrer's credit is in the ledger) or capped (the referrer had reached
-- the monthly cap). A refund before then cancels it.
CREATE TABLE referrals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id       UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    -- lowercased, as orders.email
    friend_email   TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'earned', 'capped', 'cancelled')),
    friend_kind    TEXT NOT NULL CHECK (friend_kind IN ('amount', 'percent')),
    friend_value   INT NOT NULL CHECK (friend_value > 0),
    friend_min     INT CHECK (friend_min > 0),
    reward         INT NOT NULL CHECK (reward > 0),
    pay_after_days INT NOT NULL CHECK (pay_after_days >= 0),
    custom_prints  BOOLEAN NOT NULL,
    -- what the friend's order got off
    discount       INT NOT NULL CHECK (discount >= 0),
    settled_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A friend is referred once: a cancelled referral frees them again.
CREATE UNIQUE INDEX referrals_friend_idx ON referrals(friend_email) WHERE status <> 'cancelled';
CREATE INDEX referrals_referrer_idx ON referrals(referrer_id, created_at DESC);
CREATE INDEX referrals_created_idx ON referrals(created_at DESC);
CREATE INDEX referrals_pending_idx ON referrals(order_id) WHERE status = 'pending';

CREATE TRIGGER referrals_updated_at
BEFORE UPDATE ON referrals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Store credit an order paid with. total = subtotal - discount + shipping - credit.
ALTER TABLE orders ADD COLUMN credit INT NOT NULL DEFAULT 0 CHECK (credit >= 0);

-- Store credit, one row per change, never updated: a customer's balance is
-- what's left of the credit added (earned, reversed, adjusted up) after
-- what was taken (spent, adjusted down), oldest-expiring first, less what
-- has expired. An expired row takes what was left of one earlier row
-- (lot_id); 0 marks a row that had nothing left. Amounts are cents.
CREATE TABLE credit_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INT NOT NULL,
    kind        TEXT NOT NULL
        CHECK (kind IN ('earned', 'spent', 'expired', 'adjusted', 'reversed')),
    order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
    referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
    lot_id      UUID REFERENCES credit_ledger(id) ON DELETE CASCADE,
    -- credit added that lapses then; NULL never does
    expires_at  TIMESTAMPTZ,
    note        TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    -- the admin who wrote it (an adjustment or an in-store redemption)
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    -- the clock, not the transaction's start: rows of one transaction stay in order
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT credit_ledger_sign CHECK (
        (kind IN ('earned', 'reversed') AND amount > 0)
        OR (kind = 'spent' AND amount < 0)
        OR (kind = 'expired' AND amount <= 0 AND lot_id IS NOT NULL)
        OR (kind = 'adjusted' AND amount <> 0)
    )
);

CREATE INDEX credit_ledger_user_idx ON credit_ledger(user_id, created_at);
-- Each referral pays once, each order spends and gets back its credit
-- once, and each row expires once.
CREATE UNIQUE INDEX credit_ledger_referral_idx ON credit_ledger(referral_id) WHERE kind = 'earned';
CREATE UNIQUE INDEX credit_ledger_order_idx ON credit_ledger(order_id, kind)
    WHERE order_id IS NOT NULL AND kind IN ('spent', 'reversed');
CREATE UNIQUE INDEX credit_ledger_lot_idx ON credit_ledger(lot_id) WHERE kind = 'expired';
CREATE INDEX credit_ledger_expiry_idx ON credit_ledger(expires_at) WHERE expires_at IS NOT NULL;

-- Spending credit at the counter: staff ask for an amount, the customer
-- gets a 6-digit code by email, and staff enter it to confirm. Only the
-- code's hash is kept; it works once, for a few minutes, with few tries.
CREATE TABLE credit_redemptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount       INT NOT NULL CHECK (amount > 0),
    bill         INT NOT NULL CHECK (bill > 0),
    code_hash    TEXT NOT NULL,
    attempts     INT NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credit_redemptions_user_idx ON credit_redemptions(user_id, created_at DESC);
