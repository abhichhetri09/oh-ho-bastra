-- name: LockVariants :many
-- Locks the variants an order takes stock from, in id order so two
-- checkouts sharing variants can't deadlock. available is whether each is
-- still on sale.
SELECT
    pv.id,
    pv.stock,
    EXISTS (SELECT 1 FROM storefront_variants sv WHERE sv.id = pv.id) AS available
FROM product_variants pv
WHERE pv.id = ANY(@ids::uuid[])
ORDER BY pv.id
FOR UPDATE OF pv;

-- name: TakeStock :exec
-- Reserves stock for an order; the caller checked it under LockVariants.
UPDATE product_variants pv
SET stock = pv.stock - x.quantity
-- two unnests in one select list pair up element by element
FROM (SELECT unnest(@ids::uuid[]) AS id, unnest(@quantities::int[]) AS quantity) AS x
WHERE pv.id = x.id;

-- name: RetakeStock :many
-- Takes stock again for an order paid after it was released (stock can't
-- go below 0, so a shortfall means oversold units; returns the variants
-- that came up short, and by how much).
WITH want AS (
    SELECT oi.variant_id, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = @order_id AND oi.variant_id IS NOT NULL
),
taken AS (
    -- the self-join reads the stock as it was before this update
    UPDATE product_variants pv
    SET stock = GREATEST(pv.stock - w.quantity, 0)
    FROM want w, product_variants before
    WHERE pv.id = w.variant_id AND before.id = pv.id
    RETURNING pv.id, GREATEST(w.quantity - before.stock, 0)::int AS shortfall
)
SELECT id, shortfall FROM taken WHERE shortfall > 0;

-- name: SetItemShortfall :exec
UPDATE order_items SET stock_shortfall = @shortfall
WHERE order_id = @order_id AND variant_id = @variant_id;

-- name: RestoreStock :exec
-- Returns an order's stock: the units it took, so not those it was short
-- of (variants deleted since are skipped).
UPDATE product_variants pv
SET stock = pv.stock + oi.quantity - oi.stock_shortfall
FROM order_items oi
WHERE oi.order_id = $1 AND pv.id = oi.variant_id;

-- name: CreateOrder :one
INSERT INTO orders (user_id, subtotal, shipping, total, currency, email, shipping_address, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CreateOrderItem :exec
INSERT INTO order_items (
    order_id, variant_id, product_id, product_name, product_slug, sku,
    options, image, unit_price, quantity, line_total
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);

-- name: SetOrderSession :exec
UPDATE orders SET stripe_session_id = $2 WHERE id = $1;

-- name: GetOrderForUpdate :one
SELECT * FROM orders WHERE id = $1 FOR UPDATE;

-- name: CancelPendingOrder :execrows
-- Only a pending order is cancelled (and then has its stock returned).
UPDATE orders
SET status = 'cancelled', cancelled_at = now()
WHERE id = $1 AND status = 'pending';

-- name: MarkOrderPaid :exec
UPDATE orders
SET status = 'paid', paid_at = now(), cancelled_at = NULL
WHERE id = $1;

-- name: ListPendingOrdersForUser :many
SELECT id, stripe_session_id FROM orders
WHERE user_id = $1 AND status = 'pending';

-- name: ListExpiredPendingOrders :many
-- Pending orders whose reservation ran out, skipping rows another
-- transaction is working on.
SELECT id, stripe_session_id FROM orders
WHERE status = 'pending' AND expires_at < @before
ORDER BY expires_at
LIMIT 100
FOR UPDATE SKIP LOCKED;

-- name: CreatePayment :exec
INSERT INTO payments (order_id, stripe_session_id, stripe_payment_intent_id, amount, currency)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT DO NOTHING;

-- name: RemoveOrderedCartLines :exec
-- After payment, the bought variants leave the buyer's cart (anything
-- added since stays).
DELETE FROM cart_items ci
USING carts c, order_items oi
WHERE ci.cart_id = c.id
AND c.user_id = @user_id
AND oi.order_id = @order_id
AND ci.variant_id = oi.variant_id;

-- name: RecordStripeEvent :execrows
INSERT INTO stripe_events (id, type) VALUES ($1, $2)
ON CONFLICT (id) DO NOTHING;

-- name: GetOrderBySession :one
SELECT * FROM orders WHERE stripe_session_id = $1 AND user_id = $2;

-- name: GetOrderByNumber :one
SELECT * FROM orders WHERE number = $1 AND user_id = $2;

-- name: GetOrderItems :many
SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name, id;

-- name: CountOrders :one
-- Orders the customer placed, not abandoned checkouts.
SELECT COUNT(*) FROM orders
WHERE user_id = $1 AND status <> 'pending' AND NOT (status = 'cancelled' AND paid_at IS NULL);

-- name: ListOrders :many
SELECT
    o.id, o.number, o.status, o.total, o.currency, o.created_at, o.paid_at,
    (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count,
    ARRAY(
        SELECT oi.image FROM order_items oi
        WHERE oi.order_id = o.id AND oi.image <> ''
        ORDER BY oi.line_total DESC, oi.id
        LIMIT 3
    )::text[] AS preview_images
FROM orders o
WHERE o.user_id = $1 AND o.status <> 'pending' AND NOT (o.status = 'cancelled' AND o.paid_at IS NULL)
ORDER BY o.created_at DESC, o.id DESC
LIMIT $2 OFFSET $3;

-- Admin: every order, filtered by status, either an order number or a
-- piece of the email, a customer, and placed dates (UTC days, both ends
-- included); all optional. Sorted by sort (created or total) and dir.

-- name: CountAdminOrders :one
SELECT COUNT(*) FROM orders o
WHERE (sqlc.narg(status)::text IS NULL OR o.status = sqlc.narg(status)::text)
  AND (sqlc.narg(number)::bigint IS NULL OR o.number = sqlc.narg(number)::bigint)
  AND (sqlc.narg(email_pattern)::text IS NULL OR o.email ILIKE sqlc.narg(email_pattern)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR o.user_id = sqlc.narg(user_id)::uuid)
  AND (sqlc.narg(from_date)::date IS NULL OR o.created_at >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR o.created_at < sqlc.narg(to_date)::date + 1);

-- name: AdminListOrders :many
SELECT
    o.id, o.number, o.status, o.total, o.currency, o.email, u.name AS customer_name,
    (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count,
    o.created_at, o.paid_at
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE (sqlc.narg(status)::text IS NULL OR o.status = sqlc.narg(status)::text)
  AND (sqlc.narg(number)::bigint IS NULL OR o.number = sqlc.narg(number)::bigint)
  AND (sqlc.narg(email_pattern)::text IS NULL OR o.email ILIKE sqlc.narg(email_pattern)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR o.user_id = sqlc.narg(user_id)::uuid)
  AND (sqlc.narg(from_date)::date IS NULL OR o.created_at >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR o.created_at < sqlc.narg(to_date)::date + 1)
ORDER BY
    CASE WHEN @sort::text = 'total' AND @dir::text = 'asc' THEN o.total END ASC,
    CASE WHEN @sort::text = 'total' AND @dir::text = 'desc' THEN o.total END DESC,
    CASE WHEN @sort::text = 'created' AND @dir::text = 'asc' THEN o.created_at END ASC,
    o.created_at DESC, o.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: AdminExportOrders :many
-- The CSV export: the list's filters and order, up to @max_rows.
SELECT
    o.number, o.status, o.created_at, o.paid_at, o.shipped_at,
    u.name AS customer_name, o.email,
    (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count,
    o.subtotal, o.shipping, o.total, o.currency, o.tracking_number,
    COALESCE(o.shipping_address->>'city', '')::text AS ship_city,
    COALESCE(o.shipping_address->>'country', '')::text AS ship_country
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE (sqlc.narg(status)::text IS NULL OR o.status = sqlc.narg(status)::text)
  AND (sqlc.narg(number)::bigint IS NULL OR o.number = sqlc.narg(number)::bigint)
  AND (sqlc.narg(email_pattern)::text IS NULL OR o.email ILIKE sqlc.narg(email_pattern)::text)
  AND (sqlc.narg(user_id)::uuid IS NULL OR o.user_id = sqlc.narg(user_id)::uuid)
  AND (sqlc.narg(from_date)::date IS NULL OR o.created_at >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR o.created_at < sqlc.narg(to_date)::date + 1)
ORDER BY
    CASE WHEN @sort::text = 'total' AND @dir::text = 'asc' THEN o.total END ASC,
    CASE WHEN @sort::text = 'total' AND @dir::text = 'desc' THEN o.total END DESC,
    CASE WHEN @sort::text = 'created' AND @dir::text = 'asc' THEN o.created_at END ASC,
    o.created_at DESC, o.id DESC
LIMIT @max_rows;

-- name: AdminGetOrder :one
SELECT * FROM orders WHERE number = $1;

-- name: AdminGetOrderForUpdate :one
-- Fulfilment changes lock the order first, like checkout's settling does.
SELECT * FROM orders WHERE number = $1 FOR UPDATE;

-- name: GetOrderPayment :one
SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1;

-- name: ShipOrder :one
UPDATE orders SET status = 'shipped', shipped_at = now(), tracking_number = sqlc.narg(tracking_number)
WHERE id = @id RETURNING *;

-- name: DeliverOrder :one
UPDATE orders SET status = 'delivered', delivered_at = now()
WHERE id = @id RETURNING *;

-- name: RefundOrder :one
UPDATE orders SET status = 'refunded', refunded_at = now()
WHERE id = @id RETURNING *;

-- name: RecordRefund :exec
UPDATE payments SET stripe_refund_id = @stripe_refund_id, refunded_at = now()
WHERE id = @id;
