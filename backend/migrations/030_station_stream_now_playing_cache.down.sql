ALTER TABLE station_streams
  DROP COLUMN IF EXISTS now_playing_song,
  DROP COLUMN IF EXISTS now_playing_artist,
  DROP COLUMN IF EXISTS now_playing_title;
