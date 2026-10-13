CREATE TABLE variant_option_values (
    variant_id      UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    option_value_id UUID REFERENCES product_option_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, option_value_id)
);

CREATE INDEX ON variant_option_values(option_value_id);
