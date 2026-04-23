ALTER TABLE station_streams
DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check,
DROP COLUMN IF EXISTS metadata_resolver_checked_at,
DROP COLUMN IF EXISTS metadata_resolver;
