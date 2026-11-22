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
INSERT INTO blanks (name, stock, price) VALUES (@name, @stock, sqlc.narg(price))
RETURNING *;

-- name: UpdateBlank :one
-- The name, the counted stock (an absolute value; the variants on it take
-- the count) and the usual price.
UPDATE blanks SET name = @name, stock = @stock, price = sqlc.narg(price), updated_at = now()
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

-- name: UpsertGarmentBlank :one
-- One colour and size of a garment. A blank of that name already (made by
-- hand) joins the garment and keeps its counted stock. clock_timestamp()
-- keeps the order they were made in within one transaction.
INSERT INTO blanks (name, stock, garment, options, price, created_at)
VALUES (@name, @stock, @garment, @options, @price, clock_timestamp())
ON CONFLICT (lower(name)) DO UPDATE SET
    garment = EXCLUDED.garment,
    options = EXCLUDED.options,
    price = EXCLUDED.price,
    updated_at = now()
RETURNING *;

-- name: ListGarmentBlanks :many
-- A garment's blanks, in the order they were made.
SELECT * FROM blanks
WHERE lower(garment) = lower(@garment)
ORDER BY created_at, lower(name);

-- name: ListGarments :many
-- The garments, with how many blanks each has.
SELECT min(garment)::text AS garment, COUNT(*)::int AS blank_count
FROM blanks
WHERE garment IS NOT NULL
GROUP BY lower(garment)
ORDER BY lower(min(garment));
