-- name: GetStoreSettings :one
SELECT theme, announcements, updated_at FROM store_settings WHERE id;

-- name: UpdateStoreTheme :one
UPDATE store_settings
SET theme = sqlc.arg(theme), updated_at = now()
WHERE id
RETURNING theme, announcements, updated_at;

-- name: UpdateAnnouncements :one
UPDATE store_settings
SET announcements = sqlc.arg(announcements)::TEXT[], updated_at = now()
WHERE id
RETURNING theme, announcements, updated_at;
