-- Garments: blanks grouped by the garment they are (a "Classic tee" in each
-- colour and size), each knowing its option values and a usual price. A
-- product's variants can then be made from a garment in one go: one per
-- blank, with its options, price and blank already set.

ALTER TABLE blanks
    ADD COLUMN garment TEXT CHECK (char_length(garment) BETWEEN 1 AND 60),
    -- [{"name": "Size", "value": "M", "type": "text"}, ...]
    ADD COLUMN options JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(options) = 'array'),
    -- cents; the variants' price unless one is given when making them
    ADD COLUMN price INTEGER CHECK (price > 0);

CREATE INDEX idx_blanks_garment ON blanks (lower(garment))
    WHERE garment IS NOT NULL;
