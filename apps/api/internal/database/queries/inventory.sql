-- Admin inventory: one row per variant. By default only what's on sale
-- (an active variant of an active product); include_hidden adds the rest.
-- Filters: a piece of the product name or SKU, a category with its
-- subcategories, and stock: out (0), low (1 to the threshold) or in.

-- name: AdminInventoryCounts :one
-- Variants per stock level for the search, category and hidden filters.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT
    COUNT(*) FILTER (WHERE pv.stock = 0)::bigint AS out_of_stock,
    COUNT(*) FILTER (WHERE pv.stock BETWEEN 1 AND sqlc.arg(low_threshold)::int)::bigint AS low,
    COUNT(*) FILTER (WHERE pv.stock > sqlc.arg(low_threshold)::int)::bigint AS in_stock
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE (sqlc.narg(pattern)::text IS NULL
       OR p.name ILIKE sqlc.narg(pattern)::text
       OR pv.sku ILIKE sqlc.narg(pattern)::text)
  AND (sqlc.narg(category_slug)::text IS NULL OR p.category_id IN (SELECT id FROM subtree))
  AND (sqlc.arg(include_hidden)::bool OR (pv.is_active AND p.is_active));

-- name: AdminInventory :many
-- Lowest stock first.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT
    pv.id AS variant_id,
    p.id AS product_id,
    p.name AS product_name,
    pv.sku,
    pv.stock,
    pv.selling_price,
    pv.is_active,
    p.is_active AS product_active,
    COALESCE(pv.images[1], p.images[1], '')::text AS image,
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
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE (sqlc.narg(pattern)::text IS NULL
       OR p.name ILIKE sqlc.narg(pattern)::text
       OR pv.sku ILIKE sqlc.narg(pattern)::text)
  AND (sqlc.narg(category_slug)::text IS NULL OR p.category_id IN (SELECT id FROM subtree))
  AND (sqlc.arg(include_hidden)::bool OR (pv.is_active AND p.is_active))
  AND (sqlc.narg(stock)::text IS NULL
       OR (sqlc.narg(stock)::text = 'out' AND pv.stock = 0)
       OR (sqlc.narg(stock)::text = 'low' AND pv.stock BETWEEN 1 AND sqlc.arg(low_threshold)::int)
       OR (sqlc.narg(stock)::text = 'in' AND pv.stock > sqlc.arg(low_threshold)::int))
ORDER BY pv.stock, p.name, pv.id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);
