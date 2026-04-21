ALTER TABLE station_streams
  ADD COLUMN IF NOT EXISTS metadata_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata_type TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS metadata_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata_error_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata_last_fetched_at TIMESTAMPTZ;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_type_check;

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_metadata_type_check
  CHECK (metadata_type IN ('auto', 'icy', 'icecast', 'shoutcast'));

UPDATE station_streams ss
SET
  metadata_enabled = s.metadata_enabled,
  metadata_type = s.metadata_type,
  metadata_error = s.metadata_error,
  metadata_error_code = s.metadata_error_code,
  metadata_last_fetched_at = s.metadata_last_fetched_at
FROM stations s
WHERE s.id = ss.station_id;

CREATE INDEX IF NOT EXISTS station_streams_metadata_enabled_idx ON station_streams (metadata_enabled);
CREATE INDEX IF NOT EXISTS station_streams_metadata_error_code_idx ON station_streams (metadata_error_code);

DROP INDEX IF EXISTS stations_metadata_enabled_idx;
DROP INDEX IF EXISTS stations_metadata_error_code_idx;

ALTER TABLE stations
  DROP CONSTRAINT IF EXISTS stations_metadata_type_check;

ALTER TABLE stations
  DROP COLUMN IF EXISTS metadata_enabled,
  DROP COLUMN IF EXISTS metadata_type,
  DROP COLUMN IF EXISTS metadata_error,
  DROP COLUMN IF EXISTS metadata_error_code,
  DROP COLUMN IF EXISTS metadata_last_fetched_at;
