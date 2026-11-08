-- Blanks: plain garments kept in stock and printed to order. A variant can
-- draw on a blank (blank_id), and then every variant on that blank shares
-- one count: selling a "Mountain tee, Black / M" takes one Black / M blank,
-- so the "Logo tee, Black / M" goes down too. A variant without a blank
-- keeps its own count as before.
--
-- product_variants.stock stays the column everything reads (storefront,
-- cart, checkout, inventory); for a variant on a blank it is a copy of the
-- blank's stock, kept in step by the triggers below:
--   * a change to a linked variant's stock (an order, a refund, an admin
--     count) is applied to its blank as the same change, and every other
--     variant on the blank is brought to the blank's new count;
--   * a change to a blank's stock is copied to all its variants;
--   * linking a variant to a blank takes the blank's count; unlinking keeps
--     the count it had, as its own.
-- Writes the triggers make themselves run nested (pg_trigger_depth() > 1)
-- and are not passed on again.

CREATE TABLE blanks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    stock      INTEGER NOT NULL CHECK (stock >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_blank_name ON blanks (lower(name));

ALTER TABLE product_variants
    ADD COLUMN blank_id UUID REFERENCES blanks (id) ON DELETE SET NULL;

CREATE INDEX idx_product_variants_blank ON product_variants (blank_id)
    WHERE blank_id IS NOT NULL;

-- A variant written directly: link takes the blank's count, a stock change
-- on a linked variant moves the blank by the same amount.
CREATE FUNCTION variant_blank_stock() RETURNS trigger AS $$
DECLARE
    blank_stock INTEGER;
BEGIN
    IF pg_trigger_depth() > 1 OR NEW.blank_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.blank_id IS DISTINCT FROM OLD.blank_id THEN
        -- newly linked: the blank's count wins over the variant's own
        -- (no such blank: left to the foreign key to refuse)
        SELECT stock INTO blank_stock FROM blanks WHERE id = NEW.blank_id;
        NEW.stock := COALESCE(blank_stock, NEW.stock);
    ELSIF NEW.stock <> OLD.stock THEN
        -- Stock never goes below 0: a sale the blank can't cover (two
        -- oversold variants reopened together) floors it, and the order's
        -- shortfall says what was missing.
        UPDATE blanks
        SET stock = GREATEST(stock + (NEW.stock - OLD.stock), 0),
            updated_at = now()
        WHERE id = NEW.blank_id
        RETURNING stock INTO blank_stock;
        NEW.stock := blank_stock;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variant_blank_stock
    BEFORE INSERT OR UPDATE OF stock, blank_id ON product_variants
    FOR EACH ROW EXECUTE FUNCTION variant_blank_stock();

-- After a statement on variants: the other variants on the blanks it
-- touched take the blanks' counts (one statement can move a blank through
-- several of its variants, as checkout does).
CREATE FUNCTION variant_blank_siblings() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    UPDATE product_variants pv
    SET stock = b.stock
    FROM blanks b
    WHERE pv.blank_id = b.id
      AND b.id IN (SELECT blank_id FROM changed WHERE blank_id IS NOT NULL)
      AND pv.stock <> b.stock;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variant_blank_siblings_upd
    AFTER UPDATE ON product_variants
    REFERENCING NEW TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION variant_blank_siblings();

-- A blank written directly (the admin's count): its variants follow.
CREATE FUNCTION blank_stock_to_variants() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 OR NEW.stock = OLD.stock THEN
        RETURN NULL;
    END IF;
    UPDATE product_variants SET stock = NEW.stock
    WHERE blank_id = NEW.id AND stock <> NEW.stock;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_blank_stock_to_variants
    AFTER UPDATE OF stock ON blanks
    FOR EACH ROW EXECUTE FUNCTION blank_stock_to_variants();
