ALTER TABLE stations
    ADD COLUMN IF NOT EXISTS style_tags   text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS format_tags  text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS texture_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS stations_style_tags_gin   ON stations USING gin(style_tags);
CREATE INDEX IF NOT EXISTS stations_format_tags_gin  ON stations USING gin(format_tags);
CREATE INDEX IF NOT EXISTS stations_texture_tags_gin ON stations USING gin(texture_tags);
