-- name: GetStoreSettings :one
SELECT theme, updated_at FROM store_settings WHERE id;

-- name: UpdateStoreTheme :one
UPDATE store_settings
SET theme = sqlc.arg(theme), updated_at = now()
WHERE id
RETURNING theme, updated_at;
