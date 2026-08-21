-- Adds reply-to-email ingestion support for the memories-of-the-deceased
-- feature. source_email_id records Resend's inbound email id for a memory
-- created from a reply, so a retried/duplicate webhook delivery from Resend
-- can't create the same memory twice (a plain UNIQUE constraint on a
-- nullable column allows unlimited NULLs -- every existing app/AI-chat
-- memory -- while still rejecting a second row for the same inbound email).
ALTER TABLE memories ADD COLUMN source_email_id varchar(255) UNIQUE;
