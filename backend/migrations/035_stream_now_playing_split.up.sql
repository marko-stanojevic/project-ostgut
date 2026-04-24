-- Split the live now-playing snapshot off the editorial station_streams row.
-- This isolates the high-churn write path from the low-churn editorial table.
--
-- Also extends the resolver vocabulary with an explicit `none` value so the
-- frontend can stop polling streams that cannot or should not return metadata.

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

-- Backfill from the existing columns so the migration is non-destructive
-- in already-deployed environments. Empty rows are skipped.
INSERT INTO stream_now_playing (
    stream_id, title, artist, song, source, metadata_url,
    error, error_code, fetched_at, updated_at
)
SELECT
    id,
    COALESCE(now_playing_title, ''),
    COALESCE(now_playing_artist, ''),
    COALESCE(now_playing_song, ''),
    COALESCE(metadata_source, ''),
    metadata_url,
    metadata_error,
    metadata_error_code,
    COALESCE(metadata_last_fetched_at, NOW()),
    NOW()
FROM station_streams;

ALTER TABLE station_streams
    DROP COLUMN now_playing_title,
    DROP COLUMN now_playing_artist,
    DROP COLUMN now_playing_song,
    DROP COLUMN metadata_error,
    DROP COLUMN metadata_error_code,
    DROP COLUMN metadata_last_fetched_at;

-- Extend resolver vocabulary with an explicit `none` value. This is the
-- terminal state for streams that cannot or must not return metadata
-- (HLS without ID3, geo-blocked, editorial disable). The frontend uses this
-- to skip polling entirely instead of hammering the empty fallback path.
ALTER TABLE station_streams
    DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check;

ALTER TABLE station_streams
    ADD CONSTRAINT station_streams_metadata_resolver_check
    CHECK (metadata_resolver IN ('', 'server', 'client', 'none'));
