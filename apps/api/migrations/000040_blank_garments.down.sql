DROP INDEX IF EXISTS idx_blanks_garment;
ALTER TABLE blanks
    DROP COLUMN IF EXISTS price,
    DROP COLUMN IF EXISTS options,
    DROP COLUMN IF EXISTS garment;
