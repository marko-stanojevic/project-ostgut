ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS stations_country_idx ON stations (country_code);
