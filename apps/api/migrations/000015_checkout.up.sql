-- Checkout: an address book, orders that snapshot what was bought, Stripe
-- payments, and the webhook events already handled.

CREATE TABLE addresses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    line1       TEXT NOT NULL,
    line2       TEXT,
    city        TEXT NOT NULL,
    region      TEXT,
    postal_code TEXT NOT NULL,
    country     TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX addresses_user_idx ON addresses(user_id, created_at DESC);

-- Customer-facing order numbers (CS-1001, ...), not guessable ids.
CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number            BIGINT NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
    subtotal          INT NOT NULL CHECK (subtotal >= 0),
    shipping          INT NOT NULL CHECK (shipping >= 0),
    total             INT NOT NULL CHECK (total >= 0),
    currency          TEXT NOT NULL DEFAULT 'usd',
    email             TEXT NOT NULL,
    shipping_address  JSONB NOT NULL,
    stripe_session_id TEXT UNIQUE,
    -- Stock is reserved for a pending order until then.
    expires_at        TIMESTAMPTZ NOT NULL,
    paid_at           TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER SEQUENCE order_number_seq OWNED BY orders.number;

CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX orders_pending_expiry_idx ON orders(expires_at) WHERE status = 'pending';

CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- What was bought, as it was: the catalog can change or lose the product.
CREATE TABLE order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id   UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_slug TEXT NOT NULL,
    sku          TEXT,
    options      JSONB NOT NULL DEFAULT '[]',
    image        TEXT NOT NULL DEFAULT '',
    unit_price   INT NOT NULL CHECK (unit_price >= 0),
    quantity     INT NOT NULL CHECK (quantity > 0),
    line_total   INT NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE payments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    stripe_session_id        TEXT NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    amount                   INT NOT NULL CHECK (amount >= 0),
    currency                 TEXT NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payments_session_idx ON payments(stripe_session_id);

-- Stripe retries webhooks; an event id is handled once.
CREATE TABLE stripe_events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
