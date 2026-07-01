-- Add opt-in/opt-out flag for birthday email notifications.
-- Defaults to true so all existing members are opted in automatically.
ALTER TABLE persons ADD COLUMN receive_notifications boolean NOT NULL DEFAULT true;
