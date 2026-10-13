-- name: GetCartLines :many
-- The user's cart, oldest line first, priced live. available is false once
-- the variant or its product is no longer on sale.
SELECT
    ci.variant_id,
    ci.quantity,
    ci.created_at AS added_at,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    pv.sku,
    pv.stock,
    COALESCE(pv.images[1], p.images[1], '')::text AS image,
    vp.selling_price,
    vp.offer_price,
    vp.price,
    (sv.id IS NOT NULL)::bool AS available,
    (
        SELECT COALESCE(
            json_agg(
                jsonb_build_object('name', po.name, 'value', pov.value, 'type', po.type)
                ORDER BY po.name
            ),
            '[]'::json
        )
        FROM variant_option_values vov
        JOIN product_option_values pov ON pov.id = vov.option_value_id
        JOIN product_options po ON po.id = pov.option_id
        WHERE vov.variant_id = pv.id
    ) AS options
FROM carts c
JOIN cart_items ci ON ci.cart_id = c.id
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
JOIN variant_prices vp ON vp.id = pv.id
LEFT JOIN storefront_variants sv ON sv.id = pv.id
WHERE c.user_id = $1
ORDER BY ci.created_at, ci.variant_id;

-- name: GetCartItemQuantity :one
SELECT quantity FROM cart_items
WHERE cart_id = $1 AND variant_id = $2;

-- name: CountCartItems :one
SELECT COUNT(*) FROM cart_items WHERE cart_id = $1;

-- name: GetVariantAvailability :one
-- A variant's stock and whether it is on sale (it and its product active).
SELECT
    pv.stock,
    EXISTS (SELECT 1 FROM storefront_variants sv WHERE sv.id = pv.id) AS available
FROM product_variants pv
WHERE pv.id = $1;

-- name: SetCartItemQuantity :exec
INSERT INTO cart_items (cart_id, variant_id, quantity)
VALUES ($1, $2, $3)
ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- name: DeleteCartItem :execrows
DELETE FROM cart_items
WHERE cart_id = $1 AND variant_id = $2;

-- name: ClearCart :exec
DELETE FROM cart_items WHERE cart_id = $1;
