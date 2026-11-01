-- Orders of this many items or more also ship free, whatever they cost
-- (alongside free_shipping_from: either one is enough). NULL: no item rule.
ALTER TABLE store_settings
    ADD COLUMN free_shipping_items INT CHECK (free_shipping_items > 0);
