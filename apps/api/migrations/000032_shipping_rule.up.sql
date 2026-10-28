-- What delivery costs, edited in Admin → Business: a flat price in cents,
-- and the subtotal (after any discount code) from which orders ship free;
-- NULL never ships free. Starts at the rule the code hard-coded before it
-- was editable (€4.90, free from €60). Orders keep what they were charged
-- (orders.shipping), so a change only prices bags and checkouts after it.
ALTER TABLE store_settings
    ADD COLUMN shipping_flat      INT NOT NULL DEFAULT 490 CHECK (shipping_flat >= 0),
    ADD COLUMN free_shipping_from INT DEFAULT 6000 CHECK (free_shipping_from > 0);
