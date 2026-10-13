-- name: EnqueueEmail :exec
INSERT INTO email_outbox (kind, order_id) VALUES (@kind, @order_id)
ON CONFLICT (order_id, kind) DO NOTHING;

-- name: ClaimDueEmails :many
-- Leases a batch of due emails: each is skipped by other senders for
-- lease_seconds, so no transaction stays open while it is sent, and one
-- whose send never finished (a crash) is taken again after that.
UPDATE email_outbox
SET next_attempt_at = now() + make_interval(secs => sqlc.arg(lease_seconds)::int),
    attempts = attempts + 1
WHERE id IN (
    SELECT id FROM email_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT sqlc.arg(batch)
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: MarkEmailSent :exec
UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL
WHERE id = @id;

-- name: RetryEmail :exec
UPDATE email_outbox
SET next_attempt_at = now() + make_interval(secs => sqlc.arg(delay_seconds)::int),
    last_error = @last_error
WHERE id = @id;

-- name: FailEmail :exec
UPDATE email_outbox SET status = 'failed', last_error = @last_error
WHERE id = @id;

-- name: GetEmailOrder :one
-- The order an email is about, with the customer's name for the greeting.
SELECT sqlc.embed(orders), users.name AS customer_name
FROM orders JOIN users ON users.id = orders.user_id
WHERE orders.id = @id;

-- Admin: the outbox, newest first, by status.

-- name: AdminEmailCounts :many
SELECT status, COUNT(*)::bigint AS count FROM email_outbox GROUP BY status;

-- name: AdminListEmails :many
SELECT e.id, e.kind, e.status, e.attempts, e.last_error, e.created_at,
    e.sent_at, e.next_attempt_at, e.requeued_at,
    o.number AS order_number, o.email
FROM email_outbox e
JOIN orders o ON o.id = e.order_id
WHERE (sqlc.narg(status)::text IS NULL OR e.status = sqlc.narg(status)::text)
ORDER BY e.created_at DESC, e.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: AdminGetEmail :one
SELECT e.id, e.kind, e.status, e.attempts, e.last_error, e.created_at,
    e.sent_at, e.next_attempt_at, e.requeued_at,
    o.number AS order_number, o.email
FROM email_outbox e
JOIN orders o ON o.id = e.order_id
WHERE e.id = $1;

-- name: AdminRequeueEmail :execrows
-- Sends a failed email back to the queue for a fresh set of attempts.
UPDATE email_outbox
SET status = 'pending', attempts = 0, next_attempt_at = now(),
    last_error = NULL, requeued_at = now()
WHERE id = $1 AND status = 'failed';
