ALTER TABLE station_streams
ADD COLUMN metadata_client_supported boolean NOT NULL DEFAULT false,
ADD COLUMN metadata_client_checked_at timestamptz;
