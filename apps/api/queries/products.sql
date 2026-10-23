-- name: CreateProduct :one
INSERT INTO products (name, slug, category_id, description, features, images, image_public_ids, is_active, is_featured)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetProductBySlug :one
SELECT * FROM products WHERE slug = $1;

-- name: GetProductByID :one
SELECT * FROM products WHERE id = $1;

-- name: ProductSlugExists :one
SELECT EXISTS (
  SELECT 1 FROM products WHERE slug = $1
) AS exists;

-- name: UpdateProduct :one
UPDATE products SET
    name = $2,
    slug = $3,
    description = $4,
    features = $5,
    images = $6,
    image_public_ids = $7,
    is_active = $8,
    is_featured = $9,
    category_id = $10
WHERE id = $1
RETURNING *;

-- name: DeleteProduct :execresult
DELETE FROM products WHERE id = $1;

-- Admin product table: every product, active or not. Count and list share
-- the filters: a name search (an ILIKE pattern the handler escapes), the
-- active flag and a category with its subcategories.

-- name: CountAdminProducts :one
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT COUNT(*)
FROM products p
WHERE (sqlc.narg(name_pattern)::text IS NULL OR p.name ILIKE sqlc.narg(name_pattern)::text)
AND (sqlc.narg(active)::bool IS NULL OR p.is_active = sqlc.narg(active)::bool)
AND (sqlc.narg(category_slug)::text IS NULL OR p.category_id IN (SELECT id FROM subtree));

-- name: AdminProductsList :many
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT
    p.*,
    c.name AS category_name,
    dv.selling_price AS default_price,
    COALESCE(vs.total_stock, 0)::int AS total_stock,
    COALESCE(vs.variant_count, 0)::int AS variant_count
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants dv ON dv.product_id = p.id AND dv.is_default
LEFT JOIN LATERAL (
    SELECT SUM(v.stock)::int AS total_stock, COUNT(*)::int AS variant_count
    FROM product_variants v
    WHERE v.product_id = p.id
) vs ON TRUE
WHERE (sqlc.narg(name_pattern)::text IS NULL OR p.name ILIKE sqlc.narg(name_pattern)::text)
AND (sqlc.narg(active)::bool IS NULL OR p.is_active = sqlc.narg(active)::bool)
AND (sqlc.narg(category_slug)::text IS NULL OR p.category_id IN (SELECT id FROM subtree))
-- Sorted by sort (name, price, stock, updated or created) and dir.
ORDER BY
    CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(dir)::text = 'asc' THEN p.name END ASC,
    CASE WHEN sqlc.arg(sort)::text = 'name' AND sqlc.arg(dir)::text = 'desc' THEN p.name END DESC,
    CASE WHEN sqlc.arg(sort)::text = 'price' AND sqlc.arg(dir)::text = 'asc' THEN dv.selling_price END ASC NULLS LAST,
    CASE WHEN sqlc.arg(sort)::text = 'price' AND sqlc.arg(dir)::text = 'desc' THEN dv.selling_price END DESC NULLS LAST,
    CASE WHEN sqlc.arg(sort)::text = 'stock' AND sqlc.arg(dir)::text = 'asc' THEN COALESCE(vs.total_stock, 0) END ASC,
    CASE WHEN sqlc.arg(sort)::text = 'stock' AND sqlc.arg(dir)::text = 'desc' THEN COALESCE(vs.total_stock, 0) END DESC,
    CASE WHEN sqlc.arg(sort)::text = 'updated' AND sqlc.arg(dir)::text = 'asc' THEN p.updated_at END ASC,
    CASE WHEN sqlc.arg(sort)::text = 'updated' AND sqlc.arg(dir)::text = 'desc' THEN p.updated_at END DESC,
    CASE WHEN sqlc.arg(sort)::text = 'created' AND sqlc.arg(dir)::text = 'asc' THEN p.created_at END ASC,
    p.created_at DESC, p.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- Storefront listings. The four queries below share one scope (an optional
-- category with all its subcategories, featured_only and the search terms);
-- count and list also share the price and option filters. Keep their WHERE
-- clauses in sync. Search terms are lowercase letters and digits (listing.go).
-- UNION (not UNION ALL) in the subtree CTE terminates even on a cycle.

-- name: ListStorefrontProducts :many
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT sp.*
FROM storefront_products sp
WHERE (sqlc.narg(category_slug)::text IS NULL OR sp.category_id IN (SELECT id FROM subtree))
AND (NOT sqlc.arg(featured_only)::bool OR sp.is_featured)
AND (
    cardinality(sqlc.arg(search_terms)::text[]) = 0
    OR product_search_document(sp.name, sp.description, sp.features, sp.category_id) @@ search_tsquery(sqlc.arg(search_terms)::text[])
    OR name_has_terms(sp.name, sqlc.arg(search_terms)::text[])
)
AND (sqlc.arg(price_min)::int = 0 OR sp.price >= sqlc.arg(price_min)::int)
AND (sqlc.arg(price_max)::int = 0 OR sp.price <= sqlc.arg(price_max)::int)
AND (
    cardinality(sqlc.arg(option_names)::text[]) = 0
    OR EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = sp.id AND v.is_active = TRUE
        AND variant_matches_options(v.id, sqlc.arg(option_names)::text[], sqlc.arg(option_values)::text[])
    )
)
ORDER BY
    -- Relevance: text rank, plus a bonus when the name holds every term.
    CASE WHEN sqlc.arg(sort)::text = 'relevance' THEN
        ts_rank(
            product_search_document(sp.name, sp.description, sp.features, sp.category_id),
            search_tsquery(sqlc.arg(search_terms)::text[])
        ) + CASE WHEN name_has_terms(sp.name, sqlc.arg(search_terms)::text[]) THEN 1 ELSE 0 END
    END DESC NULLS LAST,
    CASE WHEN sqlc.arg(sort)::text = 'price_asc' THEN sp.price END ASC,
    CASE WHEN sqlc.arg(sort)::text = 'price_desc' THEN sp.price END DESC,
    sp.created_at DESC,
    sp.id DESC
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountStorefrontProducts :one
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT COUNT(*)
FROM storefront_products sp
WHERE (sqlc.narg(category_slug)::text IS NULL OR sp.category_id IN (SELECT id FROM subtree))
AND (NOT sqlc.arg(featured_only)::bool OR sp.is_featured)
AND (
    cardinality(sqlc.arg(search_terms)::text[]) = 0
    OR product_search_document(sp.name, sp.description, sp.features, sp.category_id) @@ search_tsquery(sqlc.arg(search_terms)::text[])
    OR name_has_terms(sp.name, sqlc.arg(search_terms)::text[])
)
AND (sqlc.arg(price_min)::int = 0 OR sp.price >= sqlc.arg(price_min)::int)
AND (sqlc.arg(price_max)::int = 0 OR sp.price <= sqlc.arg(price_max)::int)
AND (
    cardinality(sqlc.arg(option_names)::text[]) = 0
    OR EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = sp.id AND v.is_active = TRUE
        AND variant_matches_options(v.id, sqlc.arg(option_names)::text[], sqlc.arg(option_values)::text[])
    )
);

-- name: GetStorefrontFilterOptions :many
-- Option values of the active variants of the products in scope. An option
-- is a colour when any product declares it as one.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT
    po.name AS option_name,
    pov.value AS option_value,
    MIN(po.type)::text AS option_type
FROM storefront_products sp
JOIN product_options po ON po.product_id = sp.id
JOIN product_option_values pov ON pov.option_id = po.id
JOIN variant_option_values vov ON vov.option_value_id = pov.id
JOIN product_variants v ON v.id = vov.variant_id AND v.is_active = TRUE
WHERE (sqlc.narg(category_slug)::text IS NULL OR sp.category_id IN (SELECT id FROM subtree))
AND (NOT sqlc.arg(featured_only)::bool OR sp.is_featured)
AND (
    cardinality(sqlc.arg(search_terms)::text[]) = 0
    OR product_search_document(sp.name, sp.description, sp.features, sp.category_id) @@ search_tsquery(sqlc.arg(search_terms)::text[])
    OR name_has_terms(sp.name, sqlc.arg(search_terms)::text[])
)
GROUP BY po.name, pov.value
ORDER BY po.name, pov.value;

-- name: GetStorefrontPriceRange :one
-- Over the same prices that price_min/price_max filter on. COALESCE: MIN and
-- MAX are NULL when nothing is in scope.
WITH RECURSIVE subtree AS (
    SELECT root.id FROM categories root WHERE root.slug = sqlc.narg(category_slug)::text
    UNION
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT
    COALESCE(MIN(sp.price), 0)::int AS min_price,
    COALESCE(MAX(sp.price), 0)::int AS max_price
FROM storefront_products sp
WHERE (sqlc.narg(category_slug)::text IS NULL OR sp.category_id IN (SELECT id FROM subtree))
AND (NOT sqlc.arg(featured_only)::bool OR sp.is_featured)
AND (
    cardinality(sqlc.arg(search_terms)::text[]) = 0
    OR product_search_document(sp.name, sp.description, sp.features, sp.category_id) @@ search_tsquery(sqlc.arg(search_terms)::text[])
    OR name_has_terms(sp.name, sqlc.arg(search_terms)::text[])
);

-- name: GetVariantsByProductSlug :many
SELECT
    sv.*,
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
        WHERE vov.variant_id = sv.id
    ) AS options
FROM storefront_variants sv
JOIN products p ON p.id = sv.product_id
WHERE p.slug = $1
ORDER BY sv.is_default DESC, sv.created_at ASC, sv.id ASC;

-- name: GetProductWithDefaultVariantBySlug :one
SELECT
    sp.*,
    pv.stock,
    pv.images AS variant_images
FROM storefront_products sp
JOIN product_variants pv ON pv.id = sp.variant_id
WHERE sp.slug = $1;

-- name: GetRelatedProducts :many
SELECT sp.*
FROM storefront_products sp
WHERE sp.category_id = (SELECT pr.category_id FROM products pr WHERE pr.slug = $1)
AND sp.slug != $1
ORDER BY sp.created_at DESC, sp.id DESC
LIMIT 8;
