-- the Google account (its "sub") a user signs in with, if any. Accounts
-- made with Google have password_hash '' (no password matches it) until
-- they choose one through "forgot password".
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
