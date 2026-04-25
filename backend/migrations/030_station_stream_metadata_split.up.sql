-- Metadata routing + live now-playing snapshot split.
--
-- Adds resolver routing fields to station_streams (editorial, low-churn) and
-- isolates the live now-playing snapshot into its own table (high-churn).
-- The resolver vocabulary includes an explicit `none` value for streams that
-- cannot or must not return metadata, so the frontend can stop polling them.

ALTER TABLE station_streams
    ADD COLUMN metadata_resolver text NOT NULL DEFAULT '',
    ADD COLUMN metadata_resolver_checked_at timestamptz,
    ADD COLUMN metadata_url text,
    ADD CONSTRAINT station_streams_metadata_resolver_check
        CHECK (metadata_resolver IN ('', 'server', 'client', 'none'));

ALTER TABLE station_streams
    DROP COLUMN metadata_error,
    DROP COLUMN metadata_error_code,
    DROP COLUMN metadata_last_fetched_at;

CREATE TABLE stream_now_playing (
    stream_id UUID PRIMARY KEY REFERENCES station_streams(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    artist TEXT NOT NULL DEFAULT '',
    song TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    metadata_url TEXT,
    error TEXT,
    error_code TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stream_now_playing_fetched_at_idx
    ON stream_now_playing (fetched_at);
