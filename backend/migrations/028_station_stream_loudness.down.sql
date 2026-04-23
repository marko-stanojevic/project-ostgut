ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_loudness_measurement_status_check;

ALTER TABLE station_streams
  DROP COLUMN IF EXISTS loudness_integrated_lufs,
  DROP COLUMN IF EXISTS loudness_peak_dbfs,
  DROP COLUMN IF EXISTS loudness_sample_duration_seconds,
  DROP COLUMN IF EXISTS loudness_measured_at,
  DROP COLUMN IF EXISTS loudness_measurement_status;
