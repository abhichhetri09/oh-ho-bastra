CREATE TABLE product_options (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'color'))
);

CREATE UNIQUE INDEX ON product_options(product_id, name);
