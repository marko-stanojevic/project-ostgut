ALTER TABLE station_streams
  ADD COLUMN IF NOT EXISTS next_probe_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_probe_error_code TEXT NOT NULL DEFAULT '';

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_last_probe_error_code_check;

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_last_probe_error_code_check
  CHECK (
    last_probe_error_code IN (
      '',
      'invalid_url',
      'unsupported_scheme',
      'disallowed_host',
      'too_many_redirects',
      'redirect_unsupported_scheme',
      'too_many_host_changes',
      'timeout',
      'request_failed',
      'http_status',
      'playlist_depth_exceeded',
      'playlist_empty',
      'playlist_read_failed'
    )
  );

UPDATE station_streams
SET next_probe_at = COALESCE(last_checked_at, NOW())
WHERE next_probe_at IS NULL;

CREATE INDEX IF NOT EXISTS station_streams_next_probe_at_idx
  ON station_streams (next_probe_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS station_streams_last_probe_error_code_idx
  ON station_streams (last_probe_error_code)
  WHERE last_probe_error_code <> '';
