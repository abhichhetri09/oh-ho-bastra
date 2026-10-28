-- The store owner's tweaks on top of the theme (Admin → Settings): the
-- headline font and the corner style. NULL is the theme's own. The API
-- validates them (StoreHeadingFontSchema, StoreCornersSchema in
-- packages/types), like the theme, so a new font needs no migration.
ALTER TABLE store_settings
    ADD COLUMN heading_font TEXT,
    ADD COLUMN corners      TEXT;
