ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_provider_check,
  DROP COLUMN IF EXISTS metadata_provider_config,
  DROP COLUMN IF EXISTS metadata_provider;
