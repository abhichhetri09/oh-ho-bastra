CREATE TABLE product_option_values (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id UUID NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
    value     TEXT NOT NULL
);

CREATE UNIQUE INDEX ON product_option_values(option_id, value);
CREATE INDEX ON product_option_values(option_id);
