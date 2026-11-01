-- name: LockCreditUser :one
-- Credit is changed one at a time per customer: each change locks the
-- user first, then reads the ledger.
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- name: ListCreditLedger :many
-- A customer's ledger, oldest first (its balance is worked out from it).
SELECT * FROM credit_ledger WHERE user_id = $1 ORDER BY created_at, id;

-- name: AddCreditEntry :one
INSERT INTO credit_ledger (
    user_id, amount, kind, order_id, referral_id, lot_id, expires_at, note, created_by, refund_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListUsersWithLapsedCredit :many
-- Customers with credit that lapsed by now and hasn't been expired yet.
SELECT DISTINCT l.user_id FROM credit_ledger l
WHERE l.amount > 0 AND l.expires_at <= @now::timestamptz
  AND NOT EXISTS (SELECT 1 FROM credit_ledger e WHERE e.lot_id = l.id)
LIMIT @max_rows;

-- name: PendingOrderCredit :one
-- Credit held by the user's unpaid checkouts (spent once they're paid).
SELECT COALESCE(SUM(credit), 0)::int AS credit FROM orders
WHERE user_id = $1 AND status = 'pending';

-- name: CreateCreditRedemption :one
INSERT INTO credit_redemptions (user_id, amount, bill, code_hash, expires_at, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: LockCreditRedemption :one
SELECT * FROM credit_redemptions WHERE id = $1 FOR UPDATE;

-- name: CountCreditRedemptionAttempt :exec
UPDATE credit_redemptions SET attempts = attempts + 1 WHERE id = $1;

-- name: ConfirmCreditRedemption :exec
UPDATE credit_redemptions SET confirmed_at = now() WHERE id = $1;

-- name: SearchCreditCustomers :many
-- Customers by name or email, for the counter.
SELECT id, name, email, created_at FROM users
WHERE role = 'customer'
  AND (email ILIKE @pattern::text OR name ILIKE @pattern::text)
ORDER BY name, email
LIMIT 20;

-- name: GetCreditCustomer :one
SELECT id, name, email, created_at FROM users WHERE id = $1 AND role = 'customer';
