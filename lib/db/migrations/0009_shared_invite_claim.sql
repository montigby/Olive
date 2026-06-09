-- Phase 1 of the shared-invite + claim flow.
-- Non-breaking: adds new tables and people columns. The existing per-profile
-- invite flow (persons.inviteToken + accounts) keeps working untouched.

-- ---------------------------------------------------------------------------
-- 1. pg_trgm for fuzzy name matching in the claim flow.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. invite_tokens — one shareable token per family (regenerable).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES family_units(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES people(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  max_uses    INTEGER,
  use_count   INTEGER NOT NULL DEFAULT 0,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one ACTIVE (un-revoked) token per family. Regenerating revokes the
-- previous one (sets revoked_at), so the partial unique index permits any
-- number of historical revoked rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_tokens_active_per_family
  ON invite_tokens (family_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. claim_requests — one row per pending / decided claim attempt.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claim_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             UUID NOT NULL REFERENCES family_units(id) ON DELETE CASCADE,
  invite_token_id       UUID NOT NULL REFERENCES invite_tokens(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL,
  target_person_id      UUID REFERENCES people(id) ON DELETE CASCADE,
  claimer_display_name  TEXT NOT NULL,
  claimer_contact       TEXT,
  claimer_signal        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'pending',
  approver_person_id    UUID REFERENCES people(id) ON DELETE SET NULL,
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_claim_requests_type
    CHECK (type IN ('claim_existing', 'create_new')),
  CONSTRAINT chk_claim_requests_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_claim_requests_status_family
  ON claim_requests (family_id, status);
CREATE INDEX IF NOT EXISTS idx_claim_requests_target
  ON claim_requests (target_person_id)
  WHERE target_person_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. people extensions for ownership + fuzzy name lookup.
-- ---------------------------------------------------------------------------
-- claimed_by stores the people.id of the person who owns this node. Equals
-- the node's own id in the typical self-claim case. The PARTIAL unique index
-- enforces one account per node (a given uuid can appear at most once).
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_people_claimed_by_unique
  ON people (claimed_by)
  WHERE claimed_by IS NOT NULL;

-- name_normalized is auto-derived from first_name + last_name so app code
-- never has to remember to keep it in sync. Lowercased and whitespace-trimmed
-- on the database side; diacritic-stripping (unaccent) can be layered on at
-- query time via similarity() if needed.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS name_normalized TEXT
  GENERATED ALWAYS AS (
    lower(trim(both ' ' FROM coalesce(first_name, '') || ' ' || coalesce(last_name, '')))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_people_name_trgm
  ON people USING gin (name_normalized gin_trgm_ops);
