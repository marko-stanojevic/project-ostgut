DROP TABLE IF EXISTS stream_now_playing;

ALTER TABLE station_streams
    ADD COLUMN metadata_error TEXT,
    ADD COLUMN metadata_error_code TEXT,
    ADD COLUMN metadata_last_fetched_at TIMESTAMPTZ;

ALTER TABLE station_streams
    DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check,
    DROP COLUMN IF EXISTS metadata_url,
    DROP COLUMN IF EXISTS metadata_resolver_checked_at,
    DROP COLUMN IF EXISTS metadata_resolver;
