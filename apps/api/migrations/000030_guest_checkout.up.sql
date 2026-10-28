-- Guest checkout: a shopper who adds to the bag without an account gets a
-- hidden 'guest' user with a session, so the cart, checkout and orders
-- work as they do for customers. A guest has no email of its own (each
-- checkout gives one, kept on the order), no password (password_hash '')
-- and the name 'Guest'. Login looks users up by email, so it can never
-- find one.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'admin', 'guest'));

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_required
    CHECK (role = 'guest' OR email IS NOT NULL);

-- The cleanup job looks for old guests.
CREATE INDEX users_guest_created_idx ON users(created_at) WHERE role = 'guest';
