-- prices are stored in the smallest currency unit (cents)
CREATE TABLE product_variants (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id             UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku                    TEXT UNIQUE,
    stock                  INTEGER NOT NULL CHECK (stock >= 0),
    images                 TEXT[] NOT NULL,
    image_public_ids       TEXT[] NOT NULL,
    selling_price          INTEGER NOT NULL,
    offer_price            INTEGER CHECK (offer_price < selling_price),
    is_default             BOOLEAN NOT NULL DEFAULT FALSE,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    option_combination_key TEXT NOT NULL,
    offer_expires_at       TIMESTAMPTZ,
    CONSTRAINT uq_variant_combination UNIQUE (product_id, option_combination_key)
);

CREATE UNIQUE INDEX unique_default_product_variant ON product_variants(product_id) WHERE is_default = TRUE;
CREATE INDEX product_variant_created_idx ON product_variants(product_id, created_at);

CREATE TRIGGER product_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
