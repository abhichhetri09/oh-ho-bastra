-- The store's own logo (an uploaded image's URL), shown in the header in
-- place of the built-in mark and name. NULL: the built-in one.
ALTER TABLE store_settings
    ADD COLUMN logo_url TEXT CHECK (logo_url IS NULL OR length(logo_url) <= 500);
