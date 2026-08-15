-- Forgot-password / account-recovery: one-time, expiring magic tokens.
-- Mirrors invite_tokens' shape (unique token, expiry, used/revoked tracking).
-- Without this, a family's sole admin who forgets their password has no
-- recovery path and the whole family is locked out permanently.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by account when invalidating a caller's other live tokens at
-- reset time (defense in depth: if multiple reset emails went out, only the
-- one actually redeemed should remain meaningful).
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account
  ON password_reset_tokens (account_id)
  WHERE used_at IS NULL;
