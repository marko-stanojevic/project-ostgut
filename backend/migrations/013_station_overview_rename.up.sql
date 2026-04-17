DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'stations' AND column_name = 'custom_description'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'stations' AND column_name = 'overview'
  ) THEN
    ALTER TABLE stations RENAME COLUMN custom_description TO overview;
  END IF;
END $$;

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS overview TEXT;