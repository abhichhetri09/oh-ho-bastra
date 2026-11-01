-- name: GetReferralCode :one
SELECT code FROM referral_codes WHERE user_id = $1;

-- name: CreateReferralCode :one
-- A new code for the user, or nothing when they have one or the code is
-- taken (the caller tries another).
INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
ON CONFLICT DO NOTHING
RETURNING code;

-- name: GetReferrerByCode :one
-- The account a code belongs to (a customer's, or an admin's: anyone with
-- an account has a code).
SELECT u.id, u.email, u.name
FROM referral_codes rc
JOIN users u ON u.id = rc.user_id
WHERE rc.code = $1 AND u.role <> 'guest';

-- name: GetCartReferral :one
SELECT referral_code FROM carts WHERE user_id = $1;

-- name: SetCartReferral :exec
-- Sets (or with NULL removes) the referral code on a cart.
UPDATE carts SET referral_code = sqlc.narg(referral_code) WHERE id = @id;

-- name: ClearCartReferral :exec
-- Once the friend's order is paid, the code leaves their bag.
UPDATE carts SET referral_code = NULL WHERE user_id = $1;

-- name: CountPriorOrders :one
-- Orders that were paid (whatever happened after), by the user or the
-- email: a referred friend must have none. A guest's bag only knows the
-- user; checkout knows the email too.
SELECT COUNT(*)::int AS count FROM orders
WHERE (user_id = @user_id OR email = @email::text)
  AND paid_at IS NOT NULL;

-- name: CountActiveReferralsForEmail :one
-- Referrals of an email that still count (not cancelled): one per friend.
SELECT COUNT(*)::int AS count FROM referrals
WHERE friend_email = @email::text AND status <> 'cancelled';

-- name: CreateReferral :one
INSERT INTO referrals (
    referrer_id, order_id, friend_email, friend_kind, friend_value,
    friend_min, reward, pay_after_days, custom_prints, discount
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CancelOrderReferral :execrows
-- The order was cancelled or refunded before the referral paid out.
UPDATE referrals SET status = 'cancelled', settled_at = now()
WHERE order_id = $1 AND status = 'pending';

-- name: RestoreOrderReferral :exec
-- An order paid after it was released takes its referral back, unless the
-- friend has been referred again since.
UPDATE referrals r SET status = 'pending', settled_at = NULL
WHERE r.order_id = $1 AND r.status = 'cancelled'
  AND NOT EXISTS (
      SELECT 1 FROM referrals o
      WHERE o.friend_email = r.friend_email AND o.status <> 'cancelled'
  );

-- name: ListDueReferrals :many
-- Pending referrals whose order was delivered pay_after_days before now,
-- oldest first, locked (skipping any another run holds).
SELECT r.*
FROM referrals r
JOIN orders o ON o.id = r.order_id
WHERE r.status = 'pending'
  AND o.status = 'delivered'
  AND o.delivered_at + make_interval(days => r.pay_after_days) <= @now::timestamptz
ORDER BY o.delivered_at, r.id
LIMIT @max_rows
FOR UPDATE OF r SKIP LOCKED;

-- name: CountEarnedSince :one
-- The referrer's referrals paid out from a time on (the monthly cap).
SELECT COUNT(*)::int AS count FROM referrals
WHERE referrer_id = @referrer_id AND status = 'earned' AND settled_at >= @since::timestamptz;

-- name: SettleReferral :one
-- Pays out (earned) or turns down (capped) a pending referral.
UPDATE referrals SET status = @status, settled_at = @settled_at::timestamptz
WHERE id = @id AND status = 'pending'
RETURNING *;

-- name: ListUserReferrals :many
-- A referrer's referrals, newest first, with when each pays out (null
-- until its order is delivered).
SELECT r.id, r.friend_email, r.status, r.reward, r.created_at, r.settled_at,
       (o.delivered_at + make_interval(days => r.pay_after_days))::timestamptz AS payout_at
FROM referrals r
JOIN orders o ON o.id = r.order_id
WHERE r.referrer_id = $1 AND o.status <> 'pending'
ORDER BY r.created_at DESC, r.id DESC
LIMIT 100;

-- Admin

-- name: CountReferrals :one
SELECT COUNT(*) FROM referrals r
WHERE (sqlc.narg(status)::text IS NULL OR r.status = sqlc.narg(status)::text);

-- name: AdminListReferrals :many
-- Every referral, newest first: who referred whom, the order, and when it
-- pays out (or did).
SELECT r.id, r.status, r.reward, r.discount, r.friend_email, r.created_at, r.settled_at,
       (o.delivered_at + make_interval(days => r.pay_after_days))::timestamptz AS payout_at,
       u.id AS referrer_id, u.name AS referrer_name, u.email AS referrer_email,
       o.number AS order_number, o.status AS order_status
FROM referrals r
JOIN users u ON u.id = r.referrer_id
JOIN orders o ON o.id = r.order_id
WHERE (sqlc.narg(status)::text IS NULL OR r.status = sqlc.narg(status)::text)
ORDER BY r.created_at DESC, r.id DESC
LIMIT $1 OFFSET $2;
