ALTER TABLE station_streams
  ADD COLUMN metadata_mode TEXT NOT NULL DEFAULT 'auto';

UPDATE station_streams
SET metadata_mode = CASE
  WHEN metadata_enabled = false THEN 'off'
  ELSE 'auto'
END;

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_metadata_mode_check
    CHECK (metadata_mode IN ('auto', 'off'));

DROP INDEX IF EXISTS station_streams_metadata_enabled_idx;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS metadata_enabled;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check;

UPDATE station_streams
SET metadata_resolver = 'unknown'
WHERE trim(COALESCE(metadata_resolver, '')) = '';

ALTER TABLE station_streams
  ALTER COLUMN metadata_resolver SET DEFAULT 'unknown';

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_metadata_resolver_check
    CHECK (metadata_resolver IN ('unknown', 'server', 'client', 'none'));

CREATE INDEX IF NOT EXISTS station_streams_metadata_mode_idx
  ON station_streams (metadata_mode);
