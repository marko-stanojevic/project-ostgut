ALTER TABLE users
  ADD COLUMN IF NOT EXISTS player_volume DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS player_last_station JSONB,
  ADD COLUMN IF NOT EXISTS player_prefs_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_player_volume_range;

ALTER TABLE users
  ADD CONSTRAINT users_player_volume_range
  CHECK (player_volume >= 0 AND player_volume <= 1);
