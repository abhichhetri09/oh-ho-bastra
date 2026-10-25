-- The seller as the storefront's footer, contact page and legal pages name
-- it, edited in Admin → Settings. EU consumer law requires these on the
-- site; empty until an admin fills them in. The address is free text, one
-- line per line.
ALTER TABLE store_settings
    ADD COLUMN business_name    TEXT NOT NULL DEFAULT '' CHECK (length(business_name) <= 120),
    ADD COLUMN business_id      TEXT NOT NULL DEFAULT '' CHECK (length(business_id) <= 40),
    ADD COLUMN business_address TEXT NOT NULL DEFAULT '' CHECK (length(business_address) <= 300),
    ADD COLUMN business_email   TEXT NOT NULL DEFAULT '' CHECK (length(business_email) <= 254),
    ADD COLUMN business_phone   TEXT NOT NULL DEFAULT '' CHECK (length(business_phone) <= 40);

-- Returns are now 30 days on plain tees only (custom prints excluded), so
-- the old promise comes out of the banner, if an admin hasn't changed it.
UPDATE store_settings
SET announcements = array_replace(
    announcements,
    '30-day returns, no questions asked',
    '30-day returns on plain tees'
);
ALTER TABLE store_settings
    ALTER COLUMN announcements SET DEFAULT ARRAY[
        'Free shipping on orders over €60',
        '30-day returns on plain tees',
        'Custom prints: send your art or a line of type'
    ]::TEXT[];
