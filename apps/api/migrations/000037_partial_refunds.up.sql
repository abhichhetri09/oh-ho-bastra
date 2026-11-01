-- Partial refunds: an order is refunded in one or more parts (chosen lines
-- and quantities, the shipping, a goodwill amount), each split between the
-- card (a Stripe refund) and store credit (a ledger row) the way the order
-- was paid. Refunds made in the Stripe Dashboard arrive by webhook and are
-- recorded here too, matched by their Stripe id. Amounts are cents.

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled',
                      'partially_refunded', 'refunded'));

ALTER TABLE orders
    -- What has gone back so far (card + credit), counting refunds Stripe
    -- is still processing; a failed one is taken off again.
    ADD COLUMN refunded_total  INT NOT NULL DEFAULT 0 CHECK (refunded_total >= 0),
    -- The part of refunded_total given back as store credit.
    ADD COLUMN refunded_credit INT NOT NULL DEFAULT 0 CHECK (refunded_credit >= 0),
    -- A chargeback on the order's payment: Stripe's dispute status
    -- (needs_response, under_review, won, lost, ...), NULL without one.
    ADD COLUMN dispute_status  TEXT,
    ADD COLUMN disputed_at     TIMESTAMPTZ,
    ADD CONSTRAINT orders_refunded_credit_le CHECK (refunded_credit <= refunded_total);

CREATE TABLE order_refunds (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- The admin's request id (idempotency): a retried request finds its refund.
    request_id       UUID UNIQUE,
    -- NULL when nothing went back by card (credit only, or a free order).
    stripe_refund_id TEXT UNIQUE,
    -- pending/requires_action: Stripe is processing it; failed/canceled:
    -- the money didn't go back (not counted in the order's totals).
    status           TEXT NOT NULL
        CHECK (status IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
    amount_card      INT NOT NULL CHECK (amount_card >= 0),
    amount_credit    INT NOT NULL CHECK (amount_credit >= 0),
    -- Of the amount, what the lines, the shipping and a goodwill extra came to.
    amount_items     INT NOT NULL DEFAULT 0 CHECK (amount_items >= 0),
    amount_shipping  INT NOT NULL DEFAULT 0 CHECK (amount_shipping >= 0),
    amount_extra     INT NOT NULL DEFAULT 0 CHECK (amount_extra >= 0),
    shipping         BOOLEAN NOT NULL DEFAULT false,
    -- admin (this API) or stripe (made in the Dashboard, seen by webhook)
    source           TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'stripe')),
    note             TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    failure_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_refunds_order_idx ON order_refunds(order_id, created_at);

CREATE TRIGGER order_refunds_updated_at
BEFORE UPDATE ON order_refunds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The lines a refund covered: how many units, what they came to, and how
-- many went back to stock.
CREATE TABLE order_refund_items (
    refund_id     UUID NOT NULL REFERENCES order_refunds(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity      INT NOT NULL CHECK (quantity > 0),
    amount        INT NOT NULL CHECK (amount >= 0),
    restocked     INT NOT NULL DEFAULT 0 CHECK (restocked >= 0 AND restocked <= quantity),
    PRIMARY KEY (refund_id, order_item_id)
);

CREATE INDEX order_refund_items_item_idx ON order_refund_items(order_item_id);

-- Credit given back per refund (an order can now have several), and taken
-- again (adjusted) when the refund fails.
ALTER TABLE credit_ledger ADD COLUMN refund_id UUID REFERENCES order_refunds(id) ON DELETE SET NULL;
DROP INDEX credit_ledger_order_idx;
CREATE UNIQUE INDEX credit_ledger_order_idx ON credit_ledger(order_id)
    WHERE order_id IS NOT NULL AND kind = 'spent';
CREATE UNIQUE INDEX credit_ledger_refund_idx ON credit_ledger(refund_id, kind)
    WHERE refund_id IS NOT NULL;

-- A refund email per refund (an order can have several).
ALTER TABLE email_outbox ADD COLUMN refund_id UUID REFERENCES order_refunds(id) ON DELETE CASCADE;
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_order_id_kind_key;
CREATE UNIQUE INDEX email_outbox_order_kind_idx ON email_outbox(order_id, kind) WHERE refund_id IS NULL;
CREATE UNIQUE INDEX email_outbox_refund_idx ON email_outbox(refund_id) WHERE refund_id IS NOT NULL;

-- Orders refunded in full before this: one refund each, of everything.
UPDATE orders SET refunded_total = total + credit, refunded_credit = credit
WHERE status = 'refunded';

INSERT INTO order_refunds (order_id, stripe_refund_id, status, amount_card, amount_credit,
                           amount_items, amount_shipping, shipping, note, created_at)
SELECT o.id, p.stripe_refund_id, 'succeeded', o.total, o.credit,
       o.subtotal - o.discount, o.shipping, o.shipping > 0, 'Full refund',
       COALESCE(o.refunded_at, o.updated_at)
FROM orders o
LEFT JOIN LATERAL (
    SELECT stripe_refund_id FROM payments WHERE order_id = o.id
    ORDER BY created_at DESC LIMIT 1
) p ON true
WHERE o.status = 'refunded';

INSERT INTO order_refund_items (refund_id, order_item_id, quantity, amount, restocked)
SELECT r.id, oi.id, oi.quantity, 0, 0
FROM order_refunds r JOIN order_items oi ON oi.order_id = r.order_id;

UPDATE credit_ledger l SET refund_id = r.id
FROM order_refunds r
WHERE l.kind = 'reversed' AND l.order_id = r.order_id;

UPDATE email_outbox e SET refund_id = r.id
FROM order_refunds r
WHERE e.kind = 'order_refunded' AND e.order_id = r.order_id;
