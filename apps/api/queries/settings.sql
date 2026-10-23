-- name: GetStoreSettings :one
SELECT theme, announcements, announcements_enabled, updated_at
FROM store_settings WHERE id;

-- name: UpdateStoreTheme :one
UPDATE store_settings
SET theme = sqlc.arg(theme), updated_at = now()
WHERE id
RETURNING theme, announcements, announcements_enabled, updated_at;

-- name: UpdateAnnouncements :one
UPDATE store_settings
SET announcements = sqlc.arg(announcements)::TEXT[],
    announcements_enabled = sqlc.arg(announcements_enabled),
    updated_at = now()
WHERE id
RETURNING theme, announcements, announcements_enabled, updated_at;
