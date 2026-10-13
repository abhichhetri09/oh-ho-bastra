-- A customer may mark one saved address as the default; checkout picks it
-- first. Without one, the newest comes first, as before.
ALTER TABLE addresses ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX addresses_one_default ON addresses(user_id) WHERE is_default;
