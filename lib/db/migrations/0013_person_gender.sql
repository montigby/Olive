-- Adds an explicit, editable gender field to every person, so
-- viewer-relative relationship labels can use gendered terms (Brother vs
-- Sister, Grandma vs Grandpa, etc.) instead of always falling back to
-- neutral ones. Nullable ("male" | "female" | NULL) -- NULL means
-- unset/prefer not to say, and callers fall back to the existing neutral
-- relationship terms in that case.
ALTER TABLE persons ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
