-- name: CreateUser :one
INSERT INTO users (name, email, password_hash, role, image_url)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: UpdateUserImage :one
UPDATE users SET image_url = $2 WHERE id = $1
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: UpdateUserName :one
UPDATE users SET name = $2 WHERE id = $1
RETURNING *;

-- name: GetUserByGoogleID :one
SELECT * FROM users WHERE google_id = $1;

-- name: CreateGoogleUser :one
INSERT INTO users (name, email, password_hash, role, google_id)
VALUES ($1, $2, '', 'customer', $3)
RETURNING *;


-- name: ListAdminEmails :many
SELECT email::text FROM users WHERE role = 'admin' AND email IS NOT NULL ORDER BY created_at;

-- name: CreateGuestUser :one
-- A hidden user for a shopper without an account: no email (each checkout
-- gives one) and no password.
INSERT INTO users (name, email, password_hash, role)
VALUES ('Guest', NULL, '', 'guest')
RETURNING *;

-- name: DeleteGuestUser :execrows
-- A guest that has no orders left (its cart and sessions go with it).
DELETE FROM users u
WHERE u.id = $1 AND u.role = 'guest'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- name: DeleteStaleGuests :execrows
-- Guests created before @before that never ordered and can't sign in any
-- more: every session expired or revoked, or none.
DELETE FROM users u
WHERE u.role = 'guest'
  AND u.created_at < @before
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)
  AND NOT EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()
  );
