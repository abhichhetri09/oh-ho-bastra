-- Attributes: the store's own option lists (Size, Colour…), which the admin
-- picks variant options from instead of typing them. A variant still keeps
-- its own copy of the name and value (product_options and
-- product_option_values), so editing a list never changes a variant that
-- was already made.

CREATE TABLE attributes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 20),
    type       TEXT NOT NULL CHECK (type IN ('text', 'color')),
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_attribute_name ON attributes (lower(name));

CREATE TABLE attribute_values (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id UUID NOT NULL REFERENCES attributes (id) ON DELETE CASCADE,
    value        TEXT NOT NULL CHECK (char_length(value) BETWEEN 1 AND 20),
    -- a colour's swatch, #rrggbb; null for a text attribute
    hex          TEXT CHECK (hex ~ '^#[0-9a-f]{6}$'),
    position     INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX uq_attribute_value ON attribute_values (attribute_id, lower(value));

WITH size AS (
    INSERT INTO attributes (name, type, position) VALUES ('Size', 'text', 0)
    RETURNING id
)
INSERT INTO attribute_values (attribute_id, value, position)
SELECT size.id, v.value, v.position
FROM size, (VALUES ('XS', 0), ('S', 1), ('M', 2), ('L', 3), ('XL', 4), ('XXL', 5), ('3XL', 6))
    AS v (value, position);

WITH colour AS (
    INSERT INTO attributes (name, type, position) VALUES ('Colour', 'color', 1)
    RETURNING id
)
INSERT INTO attribute_values (attribute_id, value, hex, position)
SELECT colour.id, v.value, v.hex, v.position
FROM colour, (VALUES
    ('Black', '#111111', 0),
    ('White', '#ffffff', 1),
    ('Grey', '#8a8a8a', 2),
    ('Navy', '#1f2a44', 3),
    ('Blue', '#2f5fb3', 4),
    ('Red', '#c0392b', 5),
    ('Green', '#2e7d4f', 6),
    ('Beige', '#d8c8a8', 7),
    ('Brown', '#6b4a2f', 8),
    ('Pink', '#e8a5b8', 9),
    ('Yellow', '#f2c94c', 10)
) AS v (value, hex, position);
