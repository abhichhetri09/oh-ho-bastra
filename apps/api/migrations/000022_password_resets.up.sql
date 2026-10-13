-- One row per "forgot password" email. Only a SHA-256 of the token is
-- stored (like sessions), so a leaked table can't reset anyone's password.
CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The per-user throttle and the "void older links" update look up by user.
CREATE INDEX password_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);
