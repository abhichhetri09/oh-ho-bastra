-- A view can't lose a column in place: rebuild both views as 000017 left them.
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
