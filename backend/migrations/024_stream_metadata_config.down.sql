ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS metadata_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata_type TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS metadata_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata_error_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata_last_fetched_at TIMESTAMPTZ;

ALTER TABLE stations
  DROP CONSTRAINT IF EXISTS stations_metadata_type_check;

ALTER TABLE stations
  ADD CONSTRAINT stations_metadata_type_check
  CHECK (metadata_type IN ('auto', 'icy', 'icecast', 'shoutcast'));

UPDATE stations s
SET
  metadata_enabled = ss.metadata_enabled,
  metadata_type = ss.metadata_type,
  metadata_error = ss.metadata_error,
  metadata_error_code = ss.metadata_error_code,
  metadata_last_fetched_at = ss.metadata_last_fetched_at
FROM station_streams ss
WHERE ss.station_id = s.id
  AND ss.priority = 1;

CREATE INDEX IF NOT EXISTS stations_metadata_enabled_idx ON stations (metadata_enabled);
CREATE INDEX IF NOT EXISTS stations_metadata_error_code_idx ON stations (metadata_error_code);

DROP INDEX IF EXISTS station_streams_metadata_enabled_idx;
DROP INDEX IF EXISTS station_streams_metadata_error_code_idx;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_type_check;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS metadata_enabled,
  DROP COLUMN IF EXISTS metadata_type,
  DROP COLUMN IF EXISTS metadata_error,
  DROP COLUMN IF EXISTS metadata_error_code,
  DROP COLUMN IF EXISTS metadata_last_fetched_at;
