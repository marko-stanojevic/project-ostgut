DROP INDEX IF EXISTS stations_country_idx;

ALTER TABLE stations
  DROP COLUMN IF EXISTS country_code;
