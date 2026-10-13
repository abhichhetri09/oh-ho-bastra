CREATE TABLE categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    slug       TEXT NOT NULL UNIQUE,
    parent_id  UUID REFERENCES categories(id) ON DELETE SET NULL CHECK (id != parent_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX categories_parent_idx ON categories(parent_id);

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A category can't be moved under one of its own descendants. The handler
-- checks this too, but only the database can do it race-free: moves are
-- serialized by a transaction-scoped advisory lock, so two concurrent moves
-- (A under B, B under A) can't both pass. Inserts can't create a cycle.
CREATE FUNCTION categories_prevent_cycle()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL OR NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('categories_tree'));

    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM categories WHERE id = NEW.parent_id
            UNION
            SELECT c.id, c.parent_id FROM categories c JOIN ancestors a ON c.id = a.parent_id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'category % would become its own ancestor', NEW.id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_no_cycle';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER categories_no_cycle
BEFORE UPDATE OF parent_id ON categories
FOR EACH ROW EXECUTE FUNCTION categories_prevent_cycle();
