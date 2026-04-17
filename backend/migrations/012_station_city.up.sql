ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS stations_city_idx ON stations (city);