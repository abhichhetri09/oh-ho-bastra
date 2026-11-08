-- What to suggest next to a bag (or any set of products), best source
-- first; the caller falls back down the list when one has too few.
-- Every query leaves out the given products and anything not on sale or
-- out of stock.

-- name: BoughtTogether :many
-- People also bought: products in the same paid orders as any of the given
-- ones, by how many such orders they were in.
WITH baskets AS (
    SELECT DISTINCT oi.order_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = ANY(@product_ids::uuid[])
      AND o.status IN ('paid', 'shipped', 'delivered', 'partially_refunded')
),
scores AS (
    SELECT oi.product_id, COUNT(DISTINCT oi.order_id) AS orders
    FROM order_items oi
    JOIN baskets b ON b.order_id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND NOT (oi.product_id = ANY(@product_ids::uuid[]))
    GROUP BY oi.product_id
)
SELECT sp.*
FROM storefront_products sp
JOIN scores s ON s.product_id = sp.id
WHERE sp.in_stock
ORDER BY s.orders DESC, sp.created_at DESC, sp.id
LIMIT @page_limit;

-- name: SimilarProducts :many
-- Similar: other products in the given products' categories, featured
-- first, then newest.
SELECT sp.*
FROM storefront_products sp
WHERE sp.category_id IN (
    SELECT p.category_id FROM products p
    WHERE p.id = ANY(@product_ids::uuid[]) AND p.category_id IS NOT NULL
)
  AND NOT (sp.id = ANY(@product_ids::uuid[]))
  AND sp.in_stock
ORDER BY sp.is_featured DESC, sp.created_at DESC, sp.id
LIMIT @page_limit;

-- name: FeaturedProducts :many
-- The last resort: the store's featured products, newest first.
SELECT sp.*
FROM storefront_products sp
WHERE sp.is_featured
  AND NOT (sp.id = ANY(@product_ids::uuid[]))
  AND sp.in_stock
ORDER BY sp.created_at DESC, sp.id
LIMIT @page_limit;
