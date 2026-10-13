-- Admin dashboard. "Sales" are orders that were paid (paid, shipped or
-- delivered); abandoned checkouts and cancellations don't count.

-- name: AdminPeriodTotals :one
-- Sales paid in [from, to).
SELECT
    COALESCE(SUM(total), 0)::bigint AS revenue,
    COUNT(*)::bigint AS orders
FROM orders
WHERE status IN ('paid', 'shipped', 'delivered')
  AND paid_at >= sqlc.arg(from_time)::timestamptz AND paid_at < sqlc.arg(to_time)::timestamptz;

-- name: AdminCustomerCount :one
SELECT COUNT(*) FROM users WHERE role = 'customer';

-- name: AdminNewCustomers :one
-- Customer accounts created in [from, to).
SELECT COUNT(*) FROM users
WHERE role = 'customer'
  AND created_at >= sqlc.arg(from_time)::timestamptz AND created_at < sqlc.arg(to_time)::timestamptz;

-- name: AdminSalesByDay :many
-- The last @days days (UTC), every day present, oldest first.
SELECT
    d.day::date AS day,
    COALESCE(SUM(o.total), 0)::bigint AS revenue,
    COUNT(o.id)::int AS orders
FROM generate_series(
    (now() AT TIME ZONE 'UTC')::date - (sqlc.arg(days)::int - 1),
    (now() AT TIME ZONE 'UTC')::date,
    interval '1 day'
) AS d(day)
LEFT JOIN orders o
    ON (o.paid_at AT TIME ZONE 'UTC')::date = d.day::date
    AND o.status IN ('paid', 'shipped', 'delivered')
GROUP BY d.day
ORDER BY d.day;

-- name: AdminOrdersByStatus :many
-- Every order by status, as the admin order tabs filter them.
SELECT status, COUNT(*)::bigint AS count
FROM orders
GROUP BY status;

-- name: AdminTopProducts :many
-- Best sellers by revenue among sales paid in [from, to).
SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(p.images[1], MAX(oi.image), '')::text AS image,
    SUM(oi.quantity)::bigint AS units,
    SUM(oi.line_total)::bigint AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status IN ('paid', 'shipped', 'delivered')
  AND o.paid_at >= sqlc.arg(from_time)::timestamptz AND o.paid_at < sqlc.arg(to_time)::timestamptz
GROUP BY p.id
ORDER BY revenue DESC, units DESC, p.name
LIMIT 5;

-- name: AdminAttention :one
-- What needs the admin: paid orders to ship (and those short of stock),
-- emails given up on, and active variants that are sold out.
SELECT
    (SELECT COUNT(*) FROM orders WHERE status = 'paid')::bigint AS to_ship,
    (
        SELECT COUNT(DISTINCT o.id) FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'paid' AND oi.stock_shortfall > 0
    )::bigint AS oversold,
    (SELECT COUNT(*) FROM email_outbox WHERE status = 'failed')::bigint AS failed_emails,
    (
        SELECT COUNT(*) FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.is_active AND p.is_active AND pv.stock = 0
    )::bigint AS out_of_stock;

-- name: AdminRecentReviews :many
SELECT r.id, r.rating, r.title, r.status, r.created_at,
    p.id AS product_id, p.name AS product_name, u.name AS author_name
FROM reviews r
JOIN products p ON p.id = r.product_id
JOIN users u ON u.id = r.user_id
ORDER BY r.created_at DESC, r.id DESC
LIMIT 5;

-- name: AdminLowStock :many
SELECT
    p.id AS product_id,
    p.name AS product_name,
    pv.id AS variant_id,
    pv.sku,
    pv.stock
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.is_active AND p.is_active AND pv.stock <= @threshold::int
ORDER BY pv.stock, p.name, pv.id
LIMIT 10;

-- name: AdminRecentOrders :many
SELECT id, number, status, total, currency, email, created_at, paid_at
FROM orders
WHERE status IN ('paid', 'shipped', 'delivered', 'refunded')
ORDER BY created_at DESC, id DESC
LIMIT 5;

-- name: AdminListVariants :many
-- Every variant of a product, inactive ones too, with its options.
SELECT
    pv.*,
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
WHERE pv.product_id = $1
ORDER BY pv.is_default DESC, pv.created_at, pv.id;

-- name: ListProductImages :many
-- The Cloudinary ids of a product's and its variants' images (for
-- cleaning up after a delete).
SELECT unnest(p.images)::text AS url, unnest(p.image_public_ids)::text AS public_id
FROM products p WHERE p.id = $1
UNION ALL
SELECT unnest(v.images)::text, unnest(v.image_public_ids)::text
FROM product_variants v WHERE v.product_id = $1;

-- name: OrderedImages :many
-- Which of these image URLs past orders show (order items keep the URL, not
-- a copy of the image), so a product delete leaves them in place.
SELECT DISTINCT image::text FROM order_items WHERE image = ANY(@urls::text[]);

-- name: AdminSearchProducts :many
-- The command palette: products by a piece of the name or of a variant's
-- SKU, hidden ones too.
SELECT p.id, p.name, p.is_active, COALESCE(p.images[1], '')::text AS image
FROM products p
WHERE p.name ILIKE @pattern::text
   OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku ILIKE @pattern::text)
ORDER BY p.is_active DESC, p.name, p.id
LIMIT 5;
