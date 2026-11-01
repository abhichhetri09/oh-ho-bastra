-- Refunds of an order (apps/api/src/checkout/refunds.ts): each part of an
-- order given back, by card and/or store credit, and the lines it covered.

-- name: ListOrderRefunds :many
SELECT * FROM order_refunds WHERE order_id = $1 ORDER BY created_at, id;

-- name: ListOrderRefundItems :many
-- The lines of an order's refunds, oldest refund first.
SELECT ri.*
FROM order_refund_items ri
JOIN order_refunds r ON r.id = ri.refund_id
WHERE r.order_id = $1
ORDER BY r.created_at, r.id, ri.order_item_id;

-- name: GetRefund :one
SELECT * FROM order_refunds WHERE id = $1;

-- name: GetRefundByRequest :one
SELECT * FROM order_refunds WHERE request_id = $1;

-- name: GetRefundByStripeID :one
SELECT * FROM order_refunds WHERE stripe_refund_id = $1;

-- name: CreateRefund :one
INSERT INTO order_refunds (
    id, order_id, request_id, stripe_refund_id, status, amount_card, amount_credit,
    amount_items, amount_shipping, amount_extra, shipping, source, note, created_by
)
VALUES (@id, @order_id, sqlc.narg(request_id), sqlc.narg(stripe_refund_id), @status,
        @amount_card, @amount_credit, @amount_items, @amount_shipping, @amount_extra,
        @shipping, @source, @note, sqlc.narg(created_by))
RETURNING *;

-- name: AdoptRefund :one
-- A card refund recorded from Stripe's webhook first (the admin's request
-- timed out after Stripe made it) takes on the admin's request.
UPDATE order_refunds
SET request_id = sqlc.narg(request_id), amount_credit = @amount_credit,
    amount_items = @amount_items, amount_shipping = @amount_shipping,
    amount_extra = @amount_extra, shipping = @shipping, source = 'admin',
    note = @note, created_by = sqlc.narg(created_by)
WHERE id = @id
RETURNING *;

-- name: SetRefundStatus :one
UPDATE order_refunds
SET status = @status, failure_reason = sqlc.narg(failure_reason)
WHERE id = @id
RETURNING *;

-- name: AddRefundItem :exec
INSERT INTO order_refund_items (refund_id, order_item_id, quantity, amount, restocked)
VALUES ($1, $2, $3, $4, $5);
