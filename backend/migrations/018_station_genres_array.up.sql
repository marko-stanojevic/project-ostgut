ALTER TABLE stations ALTER COLUMN genre DROP DEFAULT;
ALTER TABLE stations ALTER COLUMN genre TYPE TEXT[] USING ARRAY[genre]::TEXT[];
ALTER TABLE stations ALTER COLUMN genre SET DEFAULT '{}';
ALTER TABLE stations RENAME COLUMN genre TO genres;
DROP INDEX IF EXISTS stations_genre_idx;
CREATE INDEX stations_genres_idx ON stations USING GIN (genres);
