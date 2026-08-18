-- Non-blocking email verification: one-time, expiring magic tokens, mirroring
-- password_reset_tokens' shape (unique token, expiry, used-tracking
-- timestamp). Verification never gates account usage -- registration and
-- login stay instant. This only gives the app a real way to learn whether an
-- address is genuine, so a password-reset link (or any automated email --
-- birthday reminders, etc.) sent to it has somewhere real to land instead of
-- silently bouncing forever against a fake address entered at signup.

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by account when invalidating a caller's other live tokens at
-- verify/resend time (defense in depth: if multiple verification emails went
-- out, only the one actually redeemed -- or the newest resend -- should
-- remain meaningful).
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_account
  ON email_verification_tokens (account_id)
  WHERE used_at IS NULL;

-- Null until the account's email is confirmed. Never read as a gate on login
-- or any feature -- only used to decide whether to show a dismissible
-- "verify your email" reminder in the app.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
