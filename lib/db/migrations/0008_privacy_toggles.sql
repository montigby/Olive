-- Per-user privacy toggles (item D-narrow).
-- When a column is TRUE, the corresponding field group is hidden from
-- all viewers EXCEPT self (tier 0) and admins of the same family unit.
-- Defaults to FALSE so existing rows preserve current behavior.

ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_address BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_socials BOOLEAN NOT NULL DEFAULT FALSE;
