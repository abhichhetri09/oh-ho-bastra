ALTER TABLE store_settings
    DROP COLUMN business_name,
    DROP COLUMN business_id,
    DROP COLUMN business_address,
    DROP COLUMN business_email,
    DROP COLUMN business_phone;

ALTER TABLE store_settings
    ALTER COLUMN announcements SET DEFAULT ARRAY[
        'Free shipping on orders over €60',
        '30-day returns, no questions asked',
        'Custom prints: send your art or a line of type'
    ]::TEXT[];
