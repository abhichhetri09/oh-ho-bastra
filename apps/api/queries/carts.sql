-- name: EnsureCart :one
-- The user's cart, created on first use. Every cart write calls this first
-- in its transaction: the upsert locks the cart row, so one user's
-- concurrent cart writes run one after another.
INSERT INTO carts (user_id)
VALUES ($1)
ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
RETURNING id;
