ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_kind_check,
  ADD CONSTRAINT station_streams_kind_check
    CHECK (kind IN ('direct', 'playlist', 'hls', 'dash'));

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_container_check,
  ADD CONSTRAINT station_streams_container_check
    CHECK (container IN ('none', 'm3u', 'm3u8', 'pls', 'mpd'));

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_type_check,
  ADD CONSTRAINT station_streams_metadata_type_check
    CHECK (metadata_type IN ('auto', 'icy', 'icecast', 'shoutcast', 'id3', 'vorbis', 'hls', 'dash', 'epg'));

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_metadata_source_check,
  ADD CONSTRAINT station_streams_metadata_source_check
    CHECK (metadata_source IS NULL OR metadata_source IN ('icy', 'icecast', 'shoutcast', 'id3', 'vorbis', 'hls', 'dash', 'epg', 'npr-composer', 'nts-live'));
