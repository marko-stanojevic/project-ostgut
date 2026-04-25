ALTER TABLE stations RENAME COLUMN genres TO genre_tags;

DROP INDEX IF EXISTS stations_genres_idx;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS subgenre_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE stations RENAME COLUMN tags TO search_tags;
ALTER TABLE stations RENAME COLUMN editor_notes TO editorial_review;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS internal_notes TEXT;

UPDATE stations
SET genre_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(genre_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

UPDATE stations
SET style_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(style_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

UPDATE stations
SET format_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(format_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

UPDATE stations
SET texture_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(texture_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

UPDATE stations
SET subgenre_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(search_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

UPDATE stations
SET search_tags = ARRAY(
    SELECT DISTINCT lower(trim(tag))
    FROM unnest(genre_tags || subgenre_tags || style_tags || format_tags || texture_tags) AS tag
    WHERE trim(tag) <> ''
    ORDER BY 1
);

CREATE INDEX IF NOT EXISTS stations_genre_tags_gin ON stations USING gin(genre_tags);
CREATE INDEX IF NOT EXISTS stations_subgenre_tags_gin ON stations USING gin(subgenre_tags);
CREATE INDEX IF NOT EXISTS stations_search_tags_gin ON stations USING gin(search_tags);