-- name: UpsertProductOptionValue :one
-- The no-op update makes RETURNING yield the row when it already exists.
INSERT INTO product_option_values (option_id, value)
VALUES (@option_id, @value)
ON CONFLICT (option_id, value) DO UPDATE SET value = EXCLUDED.value
RETURNING *;

-- name: GetOptionValuesByOption :many
SELECT * FROM product_option_values
WHERE option_id = $1;

-- name: GetOptionValueByID :one
SELECT * FROM product_option_values
WHERE id = $1;

-- name: DeleteProductOptionValue :exec
DELETE FROM product_option_values
WHERE id = $1;

-- name: GetOptionValueByValue :one
SELECT * FROM product_option_values WHERE option_id = $1 AND value = $2;