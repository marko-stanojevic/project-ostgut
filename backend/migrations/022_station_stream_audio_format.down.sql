ALTER TABLE station_streams
    DROP COLUMN IF EXISTS bit_depth,
    DROP COLUMN IF EXISTS sample_rate_hz,
    DROP COLUMN IF EXISTS channels;
