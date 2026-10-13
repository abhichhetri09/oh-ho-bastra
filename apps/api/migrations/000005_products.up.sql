CREATE TABLE products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    slug             TEXT NOT NULL UNIQUE,
    category_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
    description      TEXT,
    features         TEXT[] NOT NULL DEFAULT '{}',
    images           TEXT[] NOT NULL,
    image_public_ids TEXT[] NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_category_created_idx ON products(category_id, created_at);

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
