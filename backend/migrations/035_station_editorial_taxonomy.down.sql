DROP INDEX IF EXISTS stations_search_tags_gin;
DROP INDEX IF EXISTS stations_subgenre_tags_gin;
DROP INDEX IF EXISTS stations_genre_tags_gin;

UPDATE stations
SET search_tags = subgenre_tags;

ALTER TABLE stations DROP COLUMN IF EXISTS internal_notes;
ALTER TABLE stations RENAME COLUMN editorial_review TO editor_notes;
ALTER TABLE stations RENAME COLUMN search_tags TO tags;
ALTER TABLE stations DROP COLUMN IF EXISTS subgenre_tags;
ALTER TABLE stations RENAME COLUMN genre_tags TO genres;

CREATE INDEX IF NOT EXISTS stations_genres_idx ON stations USING gin(genres);