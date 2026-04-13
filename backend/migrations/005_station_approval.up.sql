-- Admin flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Station moderation + editorial enrichment
ALTER TABLE stations ADD COLUMN IF NOT EXISTS status              TEXT    NOT NULL DEFAULT 'pending';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS custom_logo         TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS custom_website      TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS custom_description  TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS editor_notes        TEXT;

CREATE INDEX IF NOT EXISTS stations_status_idx ON stations (status);
