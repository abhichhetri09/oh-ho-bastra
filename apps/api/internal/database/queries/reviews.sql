-- name: GetStorefrontProductIDBySlug :one
SELECT id FROM storefront_products WHERE slug = $1;

-- name: CountPublishedReviews :one
SELECT COUNT(*) FROM reviews WHERE product_id = $1 AND status = 'published';

-- name: ListPublishedReviews :many
SELECT r.id, r.rating, r.title, r.body, r.created_at, r.updated_at, u.name AS author_name
FROM reviews r
JOIN users u ON u.id = r.user_id
WHERE r.product_id = $1 AND r.status = 'published'
ORDER BY r.created_at DESC, r.id DESC
LIMIT $2 OFFSET $3;

-- name: ReviewDistribution :many
-- Published reviews per star; stars without any are left out.
SELECT rating, COUNT(*)::int AS count
FROM reviews
WHERE product_id = $1 AND status = 'published'
GROUP BY rating;

-- name: GetMyReview :one
SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2;

-- name: HasBoughtProduct :one
-- Whether a paid (or later) order of the user's holds the product.
SELECT EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = @user_id
    AND oi.product_id = @product_id
    AND o.status IN ('paid', 'shipped', 'delivered')
);

-- name: ListReviewedProductIDs :many
-- Products of the order the user has reviewed (a hidden review counts too:
-- writing again would edit it).
SELECT DISTINCT r.product_id
FROM reviews r
JOIN order_items oi ON oi.product_id = r.product_id
WHERE oi.order_id = @order_id AND r.user_id = @user_id;

-- name: UpsertReview :one
-- Writing again edits the review; a hidden review stays hidden.
INSERT INTO reviews (product_id, user_id, rating, title, body)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (product_id, user_id) DO UPDATE
SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body
RETURNING *;

-- name: DeleteReview :execrows
DELETE FROM reviews WHERE product_id = $1 AND user_id = $2;

-- Admin moderation: every review, filtered by status and rating.

-- name: CountAdminReviews :one
SELECT COUNT(*) FROM reviews r
WHERE (sqlc.narg(status)::text IS NULL OR r.status = sqlc.narg(status)::text)
  AND (sqlc.narg(rating)::int IS NULL OR r.rating = sqlc.narg(rating)::int);

-- name: AdminListReviews :many
SELECT
    r.id, r.rating, r.title, r.body, r.status, r.created_at, r.updated_at,
    p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
    u.name AS author_name, u.email AS author_email
FROM reviews r
JOIN products p ON p.id = r.product_id
JOIN users u ON u.id = r.user_id
WHERE (sqlc.narg(status)::text IS NULL OR r.status = sqlc.narg(status)::text)
  AND (sqlc.narg(rating)::int IS NULL OR r.rating = sqlc.narg(rating)::int)
ORDER BY r.created_at DESC, r.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: SetReviewStatus :one
-- The rating trigger refreshes the product's average and count.
WITH updated AS (
    UPDATE reviews SET status = @status WHERE reviews.id = @id RETURNING *
)
SELECT
    r.id, r.rating, r.title, r.body, r.status, r.created_at, r.updated_at,
    p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
    u.name AS author_name, u.email AS author_email
FROM updated r
JOIN products p ON p.id = r.product_id
JOIN users u ON u.id = r.user_id;
