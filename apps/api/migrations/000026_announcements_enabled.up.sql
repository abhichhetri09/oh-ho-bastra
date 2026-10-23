-- Turns the storefront's top banner on and off without losing its
-- messages (Admin → Settings).
ALTER TABLE store_settings
    ADD COLUMN announcements_enabled BOOLEAN NOT NULL DEFAULT TRUE;
