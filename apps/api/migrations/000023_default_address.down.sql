DROP INDEX IF EXISTS addresses_one_default;
ALTER TABLE addresses DROP COLUMN IF EXISTS is_default;
