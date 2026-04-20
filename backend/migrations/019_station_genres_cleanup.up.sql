-- Remove empty-string elements left by the TEXT → TEXT[] migration on stations
-- that previously had genre = ''.
UPDATE stations
SET genres = ARRAY(
    SELECT trim(g)
    FROM unnest(genres) g
    WHERE trim(g) != ''
)
WHERE '' = ANY(genres) OR EXISTS (
    SELECT 1 FROM unnest(genres) g WHERE trim(g) = ''
);
