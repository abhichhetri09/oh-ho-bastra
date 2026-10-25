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
