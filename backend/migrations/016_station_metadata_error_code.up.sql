ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS metadata_error_code TEXT;

CREATE INDEX IF NOT EXISTS stations_metadata_error_code_idx ON stations (metadata_error_code);