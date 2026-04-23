ALTER TABLE station_streams
DROP COLUMN IF EXISTS metadata_client_checked_at,
DROP COLUMN IF EXISTS metadata_client_supported;
