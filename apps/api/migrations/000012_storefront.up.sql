-- The offer a variant sells at right now: offer_price while it is set and
-- unexpired (no expiry means open-ended), else NULL. Every storefront price,
-- sort and filter goes through this so they agree with what the cart charges.
CREATE FUNCTION active_offer_price(offer_price INT, offer_expires_at TIMESTAMPTZ)
RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN offer_price IS NOT NULL AND (offer_expires_at IS NULL OR offer_expires_at > now())
        THEN offer_price
    END
$$;

-- Publicly visible products (active, with an active default variant), priced
-- by their default variant. price is what the customer pays.
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

-- Active variants of visible products, with the same pricing columns.
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

-- True when the variant has, for every option name in names, one of the values
-- paired with that name (names[i] goes with vals[i]): values of one option are
-- ORed, different options ANDed. Empty arrays match every variant.
CREATE FUNCTION variant_matches_options(v_id UUID, names TEXT[], vals TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM unnest(names) AS wanted(name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM variant_option_values vov
            JOIN product_option_values pov ON pov.id = vov.option_value_id
            JOIN product_options po ON po.id = pov.option_id
            JOIN unnest(names, vals) AS f(name, value) ON f.name = po.name AND f.value = pov.value
            WHERE vov.variant_id = v_id AND po.name = wanted.name
        )
    )
$$;
