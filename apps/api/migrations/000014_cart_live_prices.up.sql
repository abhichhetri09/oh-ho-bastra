-- The cart shows live prices; orders snapshot the price they charge, so a
-- price frozen at add-to-cart time is never used.
ALTER TABLE cart_items DROP COLUMN unit_price;

-- What every variant sells at right now, on sale or not (storefront_variants
-- only has the visible ones). The cart prices lines that went off sale with
-- it, so they still show what they cost.
CREATE VIEW variant_prices AS
SELECT
    pv.id,
    pv.selling_price,
    active_offer_price(pv.offer_price, pv.offer_expires_at) AS offer_price,
    COALESCE(active_offer_price(pv.offer_price, pv.offer_expires_at), pv.selling_price) AS price
FROM product_variants pv;
