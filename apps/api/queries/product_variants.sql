-- name: CreateProductVariant :one
INSERT INTO product_variants (product_id, sku, stock, images, image_public_ids, selling_price, offer_price, offer_expires_at, is_default, is_active, option_combination_key)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetVariantsByProduct :many
SELECT * FROM product_variants
WHERE product_id = $1 AND is_active = TRUE
ORDER BY is_default DESC, created_at ASC;

-- name: GetProductVariant :one
-- Admin routes address a variant through its product, so a variant id from
-- another product is not found.
SELECT * FROM product_variants
WHERE id = @id AND product_id = @product_id;

-- name: VariantSKUExists :one
SELECT EXISTS (
    SELECT 1 FROM product_variants WHERE sku = $1
) AS exists;

-- name: GetDefaultVariant :one
SELECT * FROM product_variants
WHERE product_id = $1 AND is_default = TRUE;

-- name: SetVariantStock :one
-- Admin stock count: an absolute value, for a variant of the given product.
UPDATE product_variants SET stock = @stock
WHERE id = @id AND product_id = @product_id
RETURNING *;

-- name: UpdateVariant :one
-- sku and option_combination_key are set at creation and never change here,
-- and stock has its own write (SetVariantStock): a form opened before an
-- order took stock would otherwise put the old count back.
UPDATE product_variants SET
    images = @images,
    image_public_ids = @image_public_ids,
    selling_price = @selling_price,
    offer_price = @offer_price,
    offer_expires_at = @offer_expires_at,
    is_default = @is_default,
    is_active = @is_active
WHERE id = @id AND product_id = @product_id
RETURNING *;

-- name: DeleteVariant :execresult
DELETE FROM product_variants WHERE id = @id AND product_id = @product_id;

-- name: ClearOtherDefaults :exec
-- Makes room for a new default (a product has at most one): unsets the
-- current default, unless it is keep_id. Runs in the same transaction as
-- the write that sets the new one.
UPDATE product_variants SET is_default = FALSE
WHERE product_id = @product_id AND is_default
  AND (sqlc.narg(keep_id)::uuid IS NULL OR id <> sqlc.narg(keep_id)::uuid);

-- A mass sale's products are chosen by one of: product_ids, a category
-- (category_id, and its subcategories when include_subcategories) or
-- all_products. The subtree is the one the admin listings walk, by id here;
-- UNION (not UNION ALL) stops even on a cycle.

-- name: PutVariantsOnSale :one
-- Every variant of the chosen products gets percent_off off its selling
-- price as its offer, replacing the one it had, ending at ends_at (NULL: no
-- end). A price too low to discount (the offer would round to 0 or to the
-- full price, which offer_price's CHECK refuses) keeps its own offer. The
-- maths is numeric: selling_price * 99 can overflow an int.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.id = sqlc.narg(category_id)::uuid
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    WHERE sqlc.arg(include_subcategories)::bool
),
discounted AS (
    SELECT
        pv.id,
        ROUND(pv.selling_price::numeric * (100 - sqlc.arg(percent_off)::int) / 100)::int AS offer_price
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE sqlc.arg(all_products)::bool
       OR p.id = ANY(sqlc.arg(product_ids)::uuid[])
       OR p.category_id IN (SELECT id FROM subtree)
),
updated AS (
    UPDATE product_variants pv SET
        offer_price = d.offer_price,
        offer_expires_at = sqlc.narg(ends_at)::timestamptz
    FROM discounted d
    WHERE pv.id = d.id AND d.offer_price > 0 AND d.offer_price < pv.selling_price
    RETURNING pv.product_id
)
SELECT COUNT(DISTINCT product_id)::int AS products, COUNT(*)::int AS variants
FROM updated;

-- name: EndVariantsSale :one
-- Clears the offer of every variant of the chosen products; only those that
-- had one (an expired one too) change and are counted.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.id = sqlc.narg(category_id)::uuid
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    WHERE sqlc.arg(include_subcategories)::bool
),
updated AS (
    UPDATE product_variants pv SET offer_price = NULL, offer_expires_at = NULL
    FROM products p
    WHERE p.id = pv.product_id
      AND (pv.offer_price IS NOT NULL OR pv.offer_expires_at IS NOT NULL)
      AND (sqlc.arg(all_products)::bool
           OR p.id = ANY(sqlc.arg(product_ids)::uuid[])
           OR p.category_id IN (SELECT id FROM subtree))
    RETURNING pv.product_id
)
SELECT COUNT(DISTINCT product_id)::int AS products, COUNT(*)::int AS variants
FROM updated;
