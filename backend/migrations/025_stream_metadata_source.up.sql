ALTER TABLE station_streams
  ADD COLUMN IF NOT EXISTS metadata_source TEXT;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_source_check;

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_metadata_source_check
  CHECK (metadata_source IS NULL OR metadata_source IN ('icy', 'icecast', 'shoutcast'));

CREATE INDEX IF NOT EXISTS station_streams_metadata_source_idx ON station_streams (metadata_source);
