-- Memories-of-the-deceased feature: deceased flag on persons, memories
-- table, and a log of which prompt emails have gone out (rotation + cadence
-- throttling).

ALTER TABLE persons ADD COLUMN IF NOT EXISTS deceased BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS date_of_passing DATE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS memory_collection_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  family_unit_id UUID NOT NULL REFERENCES family_units(id) ON DELETE CASCADE,
  contributor_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]',
  prompt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_person ON memories (person_id);

CREATE TABLE IF NOT EXISTS memory_prompt_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  recipient_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  prompt_key VARCHAR(64) NOT NULL,
  category VARCHAR(32),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_prompt_log_pair ON memory_prompt_log (person_id, recipient_person_id);

-- One-click "stop prompts about this person" -- scoped per (deceased person,
-- recipient) pair, not a blanket unsubscribe from all Olive email.
CREATE TABLE IF NOT EXISTS memory_prompt_optouts (
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  recipient_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, recipient_person_id)
);
