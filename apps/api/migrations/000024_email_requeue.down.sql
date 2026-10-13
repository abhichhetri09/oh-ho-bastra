DROP INDEX IF EXISTS email_outbox_status_idx;
ALTER TABLE email_outbox DROP COLUMN IF EXISTS requeued_at;
