-- Freeform notes field on persons: catches facts that don't fit any
-- structured column (an interest, a hobby, a personality note, etc.) so the
-- AI chat assistant has somewhere real to put them instead of silently
-- dropping them. Human-editable from the profile page too.

ALTER TABLE persons ADD COLUMN notes TEXT;
