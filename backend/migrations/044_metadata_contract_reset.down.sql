ALTER TABLE station_streams
  ADD COLUMN metadata_enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE station_streams
SET metadata_enabled = metadata_mode <> 'off';

DROP INDEX IF EXISTS station_streams_metadata_mode_idx;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_mode_check;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS metadata_mode;

CREATE INDEX IF NOT EXISTS station_streams_metadata_enabled_idx
  ON station_streams (metadata_enabled);

UPDATE station_streams
SET metadata_resolver = ''
WHERE metadata_resolver = 'unknown';

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check;

ALTER TABLE station_streams
  ALTER COLUMN metadata_resolver SET DEFAULT '';

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_metadata_resolver_check
    CHECK (metadata_resolver IN ('', 'server', 'client', 'none'));
