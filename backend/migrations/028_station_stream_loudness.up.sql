ALTER TABLE station_streams
  ADD COLUMN IF NOT EXISTS loudness_integrated_lufs DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS loudness_peak_dbfs DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS loudness_sample_duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loudness_measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loudness_measurement_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE station_streams
  DROP CONSTRAINT IF EXISTS station_streams_loudness_measurement_status_check;

ALTER TABLE station_streams
  ADD CONSTRAINT station_streams_loudness_measurement_status_check
  CHECK (loudness_measurement_status IN ('unknown', 'measured', 'insufficient_sample', 'unavailable', 'failed'));
