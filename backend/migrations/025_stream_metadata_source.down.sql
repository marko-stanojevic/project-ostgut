DROP INDEX IF EXISTS station_streams_metadata_source_idx;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_source_check;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS metadata_source;
