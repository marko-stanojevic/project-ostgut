DROP INDEX IF EXISTS stations_genres_idx;
ALTER TABLE stations RENAME COLUMN genres TO genre;
ALTER TABLE stations ALTER COLUMN genre DROP DEFAULT;
ALTER TABLE stations ALTER COLUMN genre TYPE TEXT USING COALESCE(genre[1], '');
ALTER TABLE stations ALTER COLUMN genre SET DEFAULT '';
CREATE INDEX stations_genre_idx ON stations (genre);
