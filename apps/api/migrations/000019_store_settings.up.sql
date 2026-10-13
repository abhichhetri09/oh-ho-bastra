-- Store-wide settings: exactly one row (id is always TRUE). The theme is
-- validated by the API (types.StoreThemes), so a new theme needs no
-- migration.
CREATE TABLE store_settings (
    id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    theme      TEXT NOT NULL DEFAULT 'editorial',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO store_settings DEFAULT VALUES;
