ALTER TABLE users
  ADD COLUMN IF NOT EXISTS player_normalization_enabled BOOLEAN NOT NULL DEFAULT true;
