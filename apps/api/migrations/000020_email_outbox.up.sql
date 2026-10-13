-- Transactional email outbox: an order's status change queues its email in
-- the same transaction, and the API's sender delivers it (with retries), so
-- a committed change always gets its email and a rolled-back one never does.
CREATE TABLE email_outbox (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            TEXT NOT NULL
        CHECK (kind IN ('order_confirmed', 'order_shipped', 'order_refunded')),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed')),
    attempts        INT NOT NULL DEFAULT 0,
    -- When the sender may next take it; a claim pushes it ahead (a lease),
    -- so an email whose send never finished is tried again later.
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One email of each kind per order: a replayed webhook can't queue twice.
    UNIQUE (order_id, kind)
);

CREATE INDEX email_outbox_due_idx ON email_outbox(next_attempt_at) WHERE status = 'pending';
