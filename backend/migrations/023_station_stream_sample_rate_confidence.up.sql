ALTER TABLE station_streams
    ADD COLUMN IF NOT EXISTS sample_rate_confidence text NOT NULL DEFAULT 'unknown';
