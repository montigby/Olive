-- Replace the bulk hide_socials toggle with independent per-handle visibility
-- toggles, so a user can hide e.g. just Venmo while keeping Instagram visible.
-- Existing hide_socials=true rows are backfilled to hide all handles, preserving
-- current visibility for anyone who already opted in to hiding.

ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_instagram BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_facebook BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_tiktok BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_linkedin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_snapchat BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_venmo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_bereal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS hide_other_social BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE persons SET
  hide_instagram = TRUE,
  hide_facebook = TRUE,
  hide_tiktok = TRUE,
  hide_linkedin = TRUE,
  hide_snapchat = TRUE,
  hide_venmo = TRUE,
  hide_bereal = TRUE,
  hide_other_social = TRUE
WHERE hide_socials = TRUE;

ALTER TABLE persons DROP COLUMN IF EXISTS hide_socials;
