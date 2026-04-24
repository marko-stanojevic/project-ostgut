ALTER TABLE station_streams
    DROP CONSTRAINT IF EXISTS station_streams_metadata_resolver_check;

ALTER TABLE station_streams
    ADD CONSTRAINT station_streams_metadata_resolver_check
    CHECK (metadata_resolver IN ('', 'server', 'client'));

ALTER TABLE station_streams
    ADD COLUMN now_playing_title TEXT NOT NULL DEFAULT '',
    ADD COLUMN now_playing_artist TEXT NOT NULL DEFAULT '',
    ADD COLUMN now_playing_song TEXT NOT NULL DEFAULT '',
    ADD COLUMN metadata_error TEXT,
    ADD COLUMN metadata_error_code TEXT,
    ADD COLUMN metadata_last_fetched_at TIMESTAMPTZ;

UPDATE station_streams ss
SET
    now_playing_title = COALESCE(snp.title, ''),
    now_playing_artist = COALESCE(snp.artist, ''),
    now_playing_song = COALESCE(snp.song, ''),
    metadata_error = snp.error,
    metadata_error_code = snp.error_code,
    metadata_last_fetched_at = snp.fetched_at
FROM stream_now_playing snp
WHERE snp.stream_id = ss.id;

DROP TABLE stream_now_playing;
