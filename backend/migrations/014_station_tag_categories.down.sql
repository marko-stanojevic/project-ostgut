DROP INDEX IF EXISTS stations_texture_tags_gin;
DROP INDEX IF EXISTS stations_format_tags_gin;
DROP INDEX IF EXISTS stations_style_tags_gin;

ALTER TABLE stations
    DROP COLUMN IF EXISTS texture_tags,
    DROP COLUMN IF EXISTS format_tags,
    DROP COLUMN IF EXISTS style_tags;
