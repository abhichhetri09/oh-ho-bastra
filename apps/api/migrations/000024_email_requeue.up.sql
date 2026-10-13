-- When an admin last sent a failed email back to the queue. The sender
-- drops emails it couldn't send within 48 hours; that clock restarts here.
ALTER TABLE email_outbox ADD COLUMN requeued_at TIMESTAMPTZ;

CREATE INDEX email_outbox_status_idx ON email_outbox(status, created_at DESC);
