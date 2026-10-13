-- One row per login ("token family"). Only hashes of refresh tokens are stored.
-- Rotation is a compare-and-swap on current_token_hash; previous_token_hash lets
-- a request that lost a concurrent refresh succeed within a short grace window.
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_token_hash  TEXT NOT NULL,
    previous_token_hash TEXT,
    previous_rotated_at TIMESTAMPTZ,
    user_agent          TEXT,
    ip_address          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_id_active ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
