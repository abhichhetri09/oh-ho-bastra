-- Admin: customer accounts with what they've ordered. "Orders" are placed
-- orders (not abandoned checkouts); "spend" is paid, shipped and delivered
-- ones, so refunds don't count.

-- name: CountAdminCustomers :one
SELECT COUNT(*) FROM users u
WHERE u.role = 'customer'
  AND (sqlc.narg(pattern)::text IS NULL
       OR u.name ILIKE sqlc.narg(pattern)::text
       OR u.email ILIKE sqlc.narg(pattern)::text);

-- name: AdminListCustomers :many
SELECT
    u.id, u.name, u.email, u.created_at,
    s.orders::bigint AS orders,
    s.spend::bigint AS spend,
    s.last_order_at::timestamptz AS last_order_at
FROM users u
CROSS JOIN LATERAL (
    SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('paid', 'shipped', 'delivered')), 0) AS spend,
        MAX(o.created_at) AS last_order_at
    FROM orders o
    WHERE o.user_id = u.id
      AND o.status <> 'pending'
      AND NOT (o.status = 'cancelled' AND o.paid_at IS NULL)
) s
WHERE u.role = 'customer'
  AND (sqlc.narg(pattern)::text IS NULL
       OR u.name ILIKE sqlc.narg(pattern)::text
       OR u.email ILIKE sqlc.narg(pattern)::text)
-- Sorted by sort (joined, orders or spend) and dir.
ORDER BY
    CASE WHEN @sort::text = 'orders' AND @dir::text = 'asc' THEN s.orders END ASC,
    CASE WHEN @sort::text = 'orders' AND @dir::text = 'desc' THEN s.orders END DESC,
    CASE WHEN @sort::text = 'spend' AND @dir::text = 'asc' THEN s.spend END ASC,
    CASE WHEN @sort::text = 'spend' AND @dir::text = 'desc' THEN s.spend END DESC,
    CASE WHEN @sort::text = 'joined' AND @dir::text = 'asc' THEN u.created_at END ASC,
    u.created_at DESC, u.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: AdminGetCustomer :one
SELECT
    u.id, u.name, u.email, u.created_at,
    s.orders::bigint AS orders,
    s.spend::bigint AS spend,
    s.paid_orders::bigint AS paid_orders,
    s.first_order_at::timestamptz AS first_order_at,
    s.last_order_at::timestamptz AS last_order_at
FROM users u
CROSS JOIN LATERAL (
    SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('paid', 'shipped', 'delivered')), 0) AS spend,
        COUNT(*) FILTER (WHERE o.status IN ('paid', 'shipped', 'delivered')) AS paid_orders,
        MIN(o.created_at) AS first_order_at,
        MAX(o.created_at) AS last_order_at
    FROM orders o
    WHERE o.user_id = u.id
      AND o.status <> 'pending'
      AND NOT (o.status = 'cancelled' AND o.paid_at IS NULL)
) s
WHERE u.id = $1 AND u.role = 'customer';

-- name: AdminCustomerReviews :many
SELECT r.id, r.rating, r.title, r.body, r.status, r.created_at,
    p.id AS product_id, p.name AS product_name
FROM reviews r
JOIN products p ON p.id = r.product_id
WHERE r.user_id = $1
ORDER BY r.created_at DESC, r.id DESC
LIMIT 10;
