-- name: ListAddresses :many
-- The default first, then the newest.
SELECT * FROM addresses
WHERE user_id = $1
ORDER BY is_default DESC, created_at DESC, id DESC;

-- name: CountAddresses :one
SELECT COUNT(*) FROM addresses WHERE user_id = $1;

-- name: CreateAddress :one
-- A new default needs ClearDefaultAddress first (in the same transaction).
INSERT INTO addresses (user_id, full_name, phone, line1, line2, city, region, postal_code, country, is_default)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetAddress :one
SELECT * FROM addresses WHERE id = $1 AND user_id = $2;

-- name: DeleteAddress :execrows
DELETE FROM addresses WHERE id = $1 AND user_id = $2;

-- Setting the default: lock the book, clear the old default, set the new
-- one, in one transaction. Two statements, not one flip: the unique index is
-- checked row by row, so a single UPDATE could see two defaults midway.

-- name: LockAddresses :exec
-- In id order: two of these locking in different orders would deadlock.
SELECT id FROM addresses WHERE user_id = $1 ORDER BY id FOR UPDATE;

-- name: ClearDefaultAddress :exec
UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default;

-- name: SetDefaultAddress :one
UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2
RETURNING *;
