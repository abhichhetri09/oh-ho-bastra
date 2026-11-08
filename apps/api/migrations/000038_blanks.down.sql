-- Variants keep the counts they had (the blank's), as their own.
DROP TRIGGER IF EXISTS trg_blank_stock_to_variants ON blanks;
DROP TRIGGER IF EXISTS trg_variant_blank_siblings_upd ON product_variants;
DROP TRIGGER IF EXISTS trg_variant_blank_stock ON product_variants;
DROP FUNCTION IF EXISTS blank_stock_to_variants();
DROP FUNCTION IF EXISTS variant_blank_siblings();
DROP FUNCTION IF EXISTS variant_blank_stock();
ALTER TABLE product_variants DROP COLUMN IF EXISTS blank_id;
DROP TABLE IF EXISTS blanks;
