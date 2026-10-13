-- name: CreatePasswordReset :one
-- At most one link a minute per account: an earlier request this minute
-- leaves nothing inserted (no rows), so the caller sends nothing.
INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
SELECT sqlc.arg(user_id)::uuid, sqlc.arg(token_hash)::text, sqlc.arg(expires_at)::timestamptz
WHERE NOT EXISTS (
    SELECT 1 FROM password_reset_tokens
    WHERE user_id = sqlc.arg(user_id)::uuid AND created_at > now() - interval '1 minute'
)
RETURNING id;

-- name: VoidOtherPasswordResets :exec
-- Only the newest link works.
UPDATE password_reset_tokens SET used_at = now()
WHERE user_id = $1 AND id <> $2 AND used_at IS NULL;

-- name: ConsumePasswordReset :one
-- Uses a link once: the first reset to get here wins, any other finds no row.
UPDATE password_reset_tokens SET used_at = now()
WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
RETURNING user_id;

-- name: DeleteStalePasswordResets :execrows
DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day';
