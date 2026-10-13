-- name: UpsertProductOption :one
-- The latest variant decides the option's type (text or color). The no-op
-- update makes RETURNING yield the row when it already exists.
INSERT INTO product_options (product_id, name, type)
VALUES (@product_id, @name, @type)
ON CONFLICT (product_id, name) DO UPDATE SET type = EXCLUDED.type
RETURNING *;

-- name: GetProductOptionsByProduct :many
SELECT * FROM product_options
WHERE product_id = $1;

-- name: DeleteProductOption :exec
DELETE FROM product_options
WHERE id = $1;


-- name: GetProductOptionByName :one
SELECT * FROM product_options WHERE name = $1 AND product_id = $2;