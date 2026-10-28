-- Guests without orders go (their carts and sessions with them). A guest
-- with orders can't be turned back into nothing: the rollback refuses
-- rather than delete orders or invent an account for them.
DELETE FROM users u
WHERE u.role = 'guest'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE role = 'guest') THEN
        RAISE EXCEPTION 'guest users still have orders: reassign or delete them before rolling back 000030';
    END IF;
END $$;

DROP INDEX IF EXISTS users_guest_created_idx;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_required;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'admin'));
