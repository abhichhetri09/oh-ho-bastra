-- Storefront search. Shoppers type partial words, so every term matches as
-- a prefix ("lin" finds linen) and all terms must match. Terms are letters
-- and digits only (the API strips everything else), so they can't inject
-- tsquery syntax. NULL without terms, so an unsearched listing never builds
-- an empty query.
CREATE FUNCTION search_tsquery(terms TEXT[])
RETURNS tsquery
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN cardinality(terms) > 0 THEN to_tsquery(
        'english',
        array_to_string(ARRAY(SELECT t || ':*' FROM unnest(terms) AS t), ' & ')
    ) END
$$;

-- Whether every (lowercase) term starts a word of the name. It catches what
-- the text search drops, such as stop words ("the" finds "The Tote") and
-- prefixes the stemmer changes. \m anchors to a word start, so "the" does
-- not match "Leather"; terms are letters and digits, so they are safe in a
-- regex.
CREATE FUNCTION name_has_terms(p_name TEXT, terms TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT cardinality(terms) > 0
        AND NOT EXISTS (SELECT 1 FROM unnest(terms) AS t WHERE lower(p_name) !~ ('\m' || t))
$$;

-- What a product is found by: its name (A), its category and the
-- category's ancestors (B), description (C) and features (D). The category
-- path lets "black shoes" match a black product in Shoes.
--
-- It reads categories, so it can't back a GIN expression index; a scan over
-- the visible products is fine at this catalog size. Past a few thousand
-- products, store this in a trigger-maintained tsvector column with a GIN
-- index instead.
CREATE FUNCTION product_search_document(
    p_name TEXT, p_description TEXT, p_features TEXT[], p_category_id UUID
)
RETURNS tsvector
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH RECURSIVE path AS (
        SELECT c.id, c.parent_id, c.name FROM categories c WHERE c.id = p_category_id
        UNION
        SELECT c.id, c.parent_id, c.name FROM categories c JOIN path p ON c.id = p.parent_id
    )
    SELECT setweight(to_tsvector('english', p_name), 'A')
        || setweight(to_tsvector('english', COALESCE((SELECT string_agg(path.name, ' ') FROM path), '')), 'B')
        || setweight(to_tsvector('english', COALESCE(p_description, '')), 'C')
        || setweight(to_tsvector('english', array_to_string(p_features, ' ')), 'D')
$$;
