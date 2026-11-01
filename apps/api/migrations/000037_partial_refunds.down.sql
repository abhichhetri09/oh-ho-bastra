-- Back to one full refund per order. A partly refunded order goes back to
-- paid (its refunds are forgotten); extra refund emails and credit rows
-- beyond the first per order are dropped so the old unique keys hold.
UPDATE orders SET status = 'paid' WHERE status = 'partially_refunded';

DELETE FROM email_outbox e
WHERE e.refund_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM email_outbox o
    WHERE o.order_id = e.order_id AND o.kind = e.kind AND o.created_at < e.created_at
);
DROP INDEX email_outbox_refund_idx;
DROP INDEX email_outbox_order_kind_idx;
ALTER TABLE email_outbox DROP COLUMN refund_id;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_order_id_kind_key UNIQUE (order_id, kind);

DELETE FROM credit_ledger l
WHERE l.refund_id IS NOT NULL AND (l.kind = 'adjusted' OR EXISTS (
    SELECT 1 FROM credit_ledger o
    WHERE o.order_id = l.order_id AND o.kind = l.kind AND o.created_at < l.created_at
));
DROP INDEX credit_ledger_refund_idx;
DROP INDEX credit_ledger_order_idx;
ALTER TABLE credit_ledger DROP COLUMN refund_id;
CREATE UNIQUE INDEX credit_ledger_order_idx ON credit_ledger(order_id, kind)
    WHERE order_id IS NOT NULL AND kind IN ('spent', 'reversed');

DROP TABLE order_refund_items;
DROP TABLE order_refunds;

ALTER TABLE orders
    DROP CONSTRAINT orders_refunded_credit_le,
    DROP COLUMN disputed_at,
    DROP COLUMN dispute_status,
    DROP COLUMN refunded_credit,
    DROP COLUMN refunded_total;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'));
