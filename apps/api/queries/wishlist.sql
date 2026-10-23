-- name: AddWishlistItem :exec
INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveWishlistItem :exec
DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2;

-- name: CountWishlistItems :one
SELECT COUNT(*) FROM wishlist_items WHERE user_id = $1;

-- name: ListWishlistIDs :many
SELECT product_id FROM wishlist_items
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 200;

-- name: CountWishlistProducts :one
-- Saved products that are still on sale (the list below).
SELECT COUNT(*)
FROM wishlist_items w
JOIN storefront_products sp ON sp.id = w.product_id
WHERE w.user_id = $1;

-- name: ListWishlistProducts :many
-- variant_count and in_stock (from the view) tell the shopper whether one
-- tap can add it to the bag (a single variant in stock) or a size/colour
-- must be chosen first.
SELECT sp.*, w.created_at AS saved_at,
    (SELECT COUNT(*) FROM product_variants v
     WHERE v.product_id = sp.id AND v.is_active)::int AS variant_count
FROM wishlist_items w
JOIN storefront_products sp ON sp.id = w.product_id
WHERE w.user_id = $1
ORDER BY w.created_at DESC, sp.id DESC
LIMIT $2 OFFSET $3;

-- name: StorefrontProductExists :one
SELECT EXISTS (SELECT 1 FROM storefront_products WHERE id = $1);
