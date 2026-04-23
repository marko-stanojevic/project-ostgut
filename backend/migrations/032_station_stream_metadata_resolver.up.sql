ALTER TABLE station_streams
ADD COLUMN metadata_resolver text NOT NULL DEFAULT '',
ADD COLUMN metadata_resolver_checked_at timestamptz,
ADD CONSTRAINT station_streams_metadata_resolver_check
CHECK (metadata_resolver IN ('', 'server', 'client'));
