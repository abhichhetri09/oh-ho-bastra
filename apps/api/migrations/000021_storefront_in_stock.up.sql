-- Whether any active variant of a product can be bought, so listings can
-- mark sold-out products before the shopper opens them. CREATE OR REPLACE
-- may add columns at the end, so storefront_variants (built on this view)
-- stays as it is.
CREATE OR REPLACE VIEW storefront_products AS
SELECT
    p.*,
    pv.id AS variant_id,
    pv.selling_price,
    active_offer_price(pv.offer_price, pv.offer_expires_at) AS offer_price,
    COALESCE(active_offer_price(pv.offer_price, pv.offer_expires_at), pv.selling_price) AS price,
    EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = p.id AND v.is_active AND v.stock > 0
    ) AS in_stock
FROM products p
JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = TRUE AND pv.is_active = TRUE
WHERE p.is_active = TRUE;
