CREATE OR REPLACE FUNCTION refresh_product_rating(p_product_id UUID) RETURNS void
LANGUAGE sql AS $$
    UPDATE products p
    SET rating_count = r.count, rating_avg = r.avg
    FROM (
        SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating), 1), 0)::real AS avg
        FROM reviews
        WHERE product_id = p_product_id AND status = 'published'
    ) r
    WHERE p.id = p_product_id
$$;

ALTER TABLE order_items DROP COLUMN IF EXISTS stock_shortfall;

DROP INDEX IF EXISTS reviews_status_idx;

ALTER TABLE payments
    DROP COLUMN IF EXISTS refunded_at,
    DROP COLUMN IF EXISTS stripe_refund_id;

DROP INDEX IF EXISTS orders_created_idx;
DROP INDEX IF EXISTS orders_status_idx;

ALTER TABLE orders
    DROP COLUMN IF EXISTS tracking_number,
    DROP COLUMN IF EXISTS refunded_at,
    DROP COLUMN IF EXISTS delivered_at,
    DROP COLUMN IF EXISTS shipped_at;
