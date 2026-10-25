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
SELECT email FROM users WHERE role = 'admin' ORDER BY created_at;
