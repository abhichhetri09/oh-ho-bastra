-- name: CreateCategory :one
INSERT INTO categories (name, slug)
VALUES ($1, $2)
RETURNING *;

-- name: CreateSubCategory :one
INSERT INTO categories (name, slug, parent_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetAllCategories :many
SELECT * FROM categories ORDER BY created_at DESC;

-- name: GetCategoryByID :one
SELECT * FROM categories WHERE id = $1;

-- name: GetCategoryBySlug :one
SELECT * FROM categories WHERE slug = $1;

-- name: GetRootCategories :many
SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name;

-- name: GetChildCategories :many
SELECT * FROM categories WHERE parent_id = $1 ORDER BY name;

-- name: GetCategoryTree :many
-- Every category with its depth (0 = root), parents before children.
-- The categories_no_cycle trigger prevents cycles; the depth bound makes
-- the recursion stop even if one slipped in.
WITH RECURSIVE category_tree AS (
  SELECT id, name, slug, parent_id, created_at, updated_at, 0 AS depth
  FROM categories
  WHERE parent_id IS NULL

  UNION

  SELECT c.id, c.name, c.slug, c.parent_id, c.created_at, c.updated_at, ct.depth + 1
  FROM categories c
  JOIN category_tree ct ON c.parent_id = ct.id
  WHERE ct.depth < 32
)
SELECT id, name, slug, parent_id, created_at, updated_at, depth::int AS depth
FROM category_tree
ORDER BY depth, name;

-- name: GetCategoryAncestors :many
WITH RECURSIVE ancestors AS (
  SELECT
    c.id,
    c.name,
    c.slug,
    c.parent_id,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE c.id = $1

  -- UNION (not ALL) stops at a repeated row, so a corrupt cycle can't recurse forever
  UNION

  SELECT
    c.id,
    c.name,
    c.slug,
    c.parent_id,
    c.created_at,
    c.updated_at
  FROM categories c
  JOIN ancestors a ON c.id = a.parent_id
)
SELECT * FROM ancestors ORDER BY created_at;

-- name: UpdateCategory :one
-- Takes the category-tree advisory lock (see the categories_no_cycle trigger,
-- migration 000004) before the row lock: the trigger alone would take it after
-- the row is locked, and two concurrent moves (A under B, B under A) deadlock.
-- The UPDATE can't produce its row without reading tree_lock first.
WITH tree_lock AS (
    SELECT pg_advisory_xact_lock(hashtext('categories_tree'))
)
UPDATE categories
SET name = $1, slug = $2, parent_id = $3
FROM tree_lock
WHERE id = $4
RETURNING categories.id, categories.name, categories.slug, categories.parent_id, categories.created_at, categories.updated_at;

-- name: DeleteCategory :execresult
DELETE FROM categories WHERE id = $1;

-- name: CategorySlugExists :one
SELECT EXISTS (
  SELECT 1 FROM categories WHERE slug = $1
) AS exists;


-- name: GetPaginatedCategories :many
SELECT * FROM categories ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2;


-- name: GetCategoriesCount :one
SELECT COUNT(*) FROM categories;