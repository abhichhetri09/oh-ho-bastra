-- Blanks: plain garments printed to order, whose stock their variants share
-- (see migrations/000038_blanks.up.sql).

-- name: ListBlanks :many
-- Every blank by name, with how many variants draw on it.
SELECT
    b.*,
    (SELECT COUNT(*) FROM product_variants pv WHERE pv.blank_id = b.id)::int AS variant_count
FROM blanks b
ORDER BY lower(b.name);

-- name: GetBlank :one
SELECT * FROM blanks WHERE id = $1;

-- name: CreateBlank :one
INSERT INTO blanks (name, stock) VALUES (@name, @stock)
RETURNING *;

-- name: UpdateBlank :one
-- The name and the counted stock (an absolute value); the variants on it
-- take the count.
UPDATE blanks SET name = @name, stock = @stock, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteBlank :execresult
-- Its variants keep the count they had, as their own.
DELETE FROM blanks WHERE id = $1;

-- name: LockBlanksOfVariants :many
-- Locks the blanks a checkout's variants draw on (before the variants, in
-- id order, as an admin count takes them), so two checkouts on one blank
-- can't both take its last unit.
SELECT b.id, b.stock
FROM blanks b
WHERE b.id IN (
    SELECT pv.blank_id FROM product_variants pv
    WHERE pv.id = ANY(@ids::uuid[]) AND pv.blank_id IS NOT NULL
)
ORDER BY b.id
FOR UPDATE;
