-- Reviews by verified buyers (the API checks for a paid order), and each
-- product's rating, kept on the product so listings can show it for free.

CREATE TABLE reviews (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    -- hidden: taken down by an admin (moderation)
    status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reviews_one_per_buyer UNIQUE (product_id, user_id)
);

CREATE INDEX reviews_product_idx ON reviews(product_id, status, created_at DESC);

CREATE TRIGGER reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE products
    ADD COLUMN rating_count INT NOT NULL DEFAULT 0,
    -- the published reviews' average, to one decimal; 0 without reviews
    ADD COLUMN rating_avg REAL NOT NULL DEFAULT 0;

CREATE FUNCTION refresh_product_rating(p_product_id UUID) RETURNS void
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

CREATE FUNCTION reviews_refresh_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM refresh_product_rating(OLD.product_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) THEN
        PERFORM refresh_product_rating(NEW.product_id);
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER reviews_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION reviews_refresh_rating();

-- storefront_products selects p.*, fixed when it was created: recreate it
-- (and storefront_variants, built on it) so it carries the rating columns.
DROP VIEW storefront_variants;
DROP VIEW storefront_products;
CREATE VIEW storefront_products AS
SELECT
    p.*,
    pv.id AS variant_id,
    pv.selling_price,
    active_offer_price(pv.offer_price, pv.offer_expires_at) AS offer_price,
    COALESCE(active_offer_price(pv.offer_price, pv.offer_expires_at), pv.selling_price) AS price
FROM products p
JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = TRUE AND pv.is_active = TRUE
WHERE p.is_active = TRUE;

CREATE VIEW storefront_variants AS
SELECT
    pv.id,
    pv.product_id,
    pv.sku,
    pv.stock,
    pv.images,
    pv.selling_price,
    active_offer_price(pv.offer_price, pv.offer_expires_at) AS offer_price,
    COALESCE(active_offer_price(pv.offer_price, pv.offer_expires_at), pv.selling_price) AS price,
    pv.offer_expires_at,
    pv.is_default,
    pv.created_at
FROM product_variants pv
JOIN storefront_products sp ON sp.id = pv.product_id
WHERE pv.is_active = TRUE;
