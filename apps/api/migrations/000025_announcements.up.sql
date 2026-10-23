-- The messages in the storefront's scrolling top banner, in order, edited
-- in Admin → Settings. An empty list hides the banner. Starts with the
-- messages the storefront showed before they were editable.
ALTER TABLE store_settings
    ADD COLUMN announcements TEXT[] NOT NULL DEFAULT ARRAY[
        'Free shipping on orders over €60',
        '30-day returns, no questions asked',
        'Custom prints: send your art or a line of type'
    ]::TEXT[]
    CHECK (cardinality(announcements) <= 6);
