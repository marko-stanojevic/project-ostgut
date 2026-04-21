ALTER TABLE station_streams
    ADD COLUMN IF NOT EXISTS bit_depth integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sample_rate_hz integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS channels integer NOT NULL DEFAULT 0;
