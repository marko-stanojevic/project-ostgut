DROP INDEX IF EXISTS station_streams_last_probe_error_code_idx;
DROP INDEX IF EXISTS station_streams_next_probe_at_idx;

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_last_probe_error_code_check;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS last_probe_error_code,
  DROP COLUMN IF EXISTS next_probe_at;
