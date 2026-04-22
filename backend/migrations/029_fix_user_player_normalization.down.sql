ALTER TABLE users
  ADD COLUMN IF NOT EXISTS player_normalization JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users
  DROP COLUMN IF EXISTS player_normalization_enabled;
