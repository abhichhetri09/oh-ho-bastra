-- name: CreateSession :one
INSERT INTO sessions (id, user_id, current_token_hash, user_agent, ip_address, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetActiveSessionByID :one
SELECT * FROM sessions
WHERE id = $1
  AND revoked_at IS NULL
  AND expires_at > now();

-- name: RotateSessionToken :one
-- Compare-and-swap: only the request presenting the current token rotates;
-- a concurrent loser gets no row and falls back to the grace path.
UPDATE sessions SET
  previous_token_hash = current_token_hash,
  previous_rotated_at = now(),
  current_token_hash  = sqlc.arg(new_token_hash),
  expires_at          = sqlc.arg(expires_at),
  last_seen_at        = now()
WHERE id = sqlc.arg(id)
  AND current_token_hash = sqlc.arg(expected_token_hash)
  AND revoked_at IS NULL
  AND expires_at > now()
RETURNING *;

-- name: RevokeSession :exec
UPDATE sessions SET revoked_at = now()
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllUserSessions :exec
UPDATE sessions SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: RevokeOtherUserSessions :exec
-- Every session of the user but keep_id (the one asking; NULL keeps none).
UPDATE sessions SET revoked_at = now()
WHERE user_id = sqlc.arg(user_id) AND id IS DISTINCT FROM sqlc.narg(keep_id) AND revoked_at IS NULL;

-- name: DeleteStaleSessions :execrows
-- expired sessions, and revoked ones kept for a week for auditing
DELETE FROM sessions
WHERE expires_at < now()
   OR revoked_at < now() - interval '7 days';
