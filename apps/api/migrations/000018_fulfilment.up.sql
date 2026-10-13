-- Fulfilment: when an order shipped, arrived or was refunded, its tracking
-- number, and the refund on its payment.
ALTER TABLE orders
    ADD COLUMN shipped_at      TIMESTAMPTZ,
    ADD COLUMN delivered_at    TIMESTAMPTZ,
    ADD COLUMN refunded_at     TIMESTAMPTZ,
    ADD COLUMN tracking_number TEXT CHECK (char_length(tracking_number) <= 64);

-- The admin orders list: by status, newest first.
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);
CREATE INDEX orders_created_idx ON orders(created_at DESC);

ALTER TABLE payments
    ADD COLUMN stripe_refund_id TEXT UNIQUE,
    ADD COLUMN refunded_at      TIMESTAMPTZ;

-- Review moderation: by status, newest first.
CREATE INDEX reviews_status_idx ON reviews(status, created_at DESC);

-- Units an order paid after its release couldn't take back (oversold), so
-- a refund with restock returns only the units it really took.
ALTER TABLE order_items
    ADD COLUMN stock_shortfall INT NOT NULL DEFAULT 0
        CHECK (stock_shortfall >= 0 AND stock_shortfall <= quantity);

-- Two moderations of one product's reviews at once each averaged their own
-- snapshot, and the later write could keep a review the other just hid.
-- Lock the product first, then count in a later statement (with a fresh
-- snapshot under READ COMMITTED).
CREATE OR REPLACE FUNCTION refresh_product_rating(p_product_id UUID) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
    UPDATE products p
    SET rating_count = r.count, rating_avg = r.avg
    FROM (
        SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating), 1), 0)::real AS avg
        FROM reviews
        WHERE product_id = p_product_id AND status = 'published'
    ) r
    WHERE p.id = p_product_id;
END
$$;
