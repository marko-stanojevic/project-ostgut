ALTER TABLE stations RENAME COLUMN favicon TO logo;
ALTER TABLE stations DROP COLUMN IF EXISTS custom_logo;
