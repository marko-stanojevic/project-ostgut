ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS metadata_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata_type TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS metadata_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata_last_fetched_at TIMESTAMPTZ;

ALTER TABLE stations
  DROP CONSTRAINT IF EXISTS stations_metadata_type_check;

ALTER TABLE stations
  ADD CONSTRAINT stations_metadata_type_check
  CHECK (metadata_type IN ('auto', 'icy', 'icecast', 'shoutcast'));

CREATE INDEX IF NOT EXISTS stations_metadata_enabled_idx ON stations (metadata_enabled);