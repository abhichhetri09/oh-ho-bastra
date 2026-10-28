-- name: GetCouponByCode :one
SELECT * FROM coupons WHERE code = $1;

-- name: LockCouponByCode :one
-- Checkout locks the code it redeems, so two checkouts can't both take
-- its last use (or one customer's only use); the second counts again
-- after the first commits.
SELECT * FROM coupons WHERE code = $1 FOR UPDATE;

-- name: GetCouponUsage :one
-- A code's uses, all of them and those by one email (lowercased).
SELECT
    COUNT(*)::int AS used,
    COUNT(*) FILTER (WHERE email = @email::text)::int AS used_by_email
FROM coupon_redemptions
WHERE coupon_id = @coupon_id;

-- name: CreateCouponRedemption :exec
INSERT INTO coupon_redemptions (coupon_id, order_id, email)
VALUES ($1, $2, $3);

-- name: RestoreCouponRedemption :exec
-- An order paid after it was released takes its use back (its code
-- permitting or not: the money is in). Nothing when the code is gone.
INSERT INTO coupon_redemptions (coupon_id, order_id, email)
SELECT c.id, o.id, lower(o.email)
FROM orders o
JOIN coupons c ON c.code = o.coupon_code
WHERE o.id = $1
ON CONFLICT (order_id) DO NOTHING;

-- name: DeleteOrderRedemption :exec
-- A cancelled order gives its use back.
DELETE FROM coupon_redemptions WHERE order_id = $1;

-- name: GetCartCoupon :one
SELECT coupon_code FROM carts WHERE user_id = $1;

-- name: SetCartCoupon :exec
-- Sets (or with NULL removes) the code on a cart.
UPDATE carts SET coupon_code = sqlc.narg(coupon_code) WHERE id = @id;

-- name: ClearPaidCartCoupon :exec
-- Once an order is paid, its code leaves the buyer's bag (unless they
-- applied another since).
UPDATE carts SET coupon_code = NULL
WHERE user_id = @user_id AND coupon_code = @coupon_code;

-- Admin: every coupon, newest first, with its uses.

-- name: CountCoupons :one
SELECT COUNT(*) FROM coupons;

-- name: AdminListCoupons :many
SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id)::int AS redemptions
FROM coupons c
ORDER BY c.created_at DESC, c.id DESC
LIMIT $1 OFFSET $2;

-- name: AdminGetCoupon :one
SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id)::int AS redemptions
FROM coupons c
WHERE c.id = $1;

-- name: CreateCoupon :one
INSERT INTO coupons (
    code, kind, value, min_subtotal, starts_at, ends_at,
    max_redemptions, once_per_customer, is_active
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id;

-- name: UpdateCoupon :one
UPDATE coupons
SET code = $2, kind = $3, value = $4, min_subtotal = $5, starts_at = $6,
    ends_at = $7, max_redemptions = $8, once_per_customer = $9, is_active = $10
WHERE id = $1
RETURNING id;

-- name: SetCouponActive :one
UPDATE coupons SET is_active = $2 WHERE id = $1 RETURNING id;

-- name: DeleteUnusedCoupon :execrows
-- Only a code nobody has used: orders refer to the ones that were.
DELETE FROM coupons c
WHERE c.id = $1
AND NOT EXISTS (SELECT 1 FROM coupon_redemptions r WHERE r.coupon_id = c.id);
