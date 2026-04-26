ALTER TABLE stations
ADD COLUMN stream_url TEXT NOT NULL DEFAULT '';

UPDATE stations AS s
SET stream_url = COALESCE(primary_stream.resolved_url, primary_stream.url, '')
FROM (
  SELECT DISTINCT ON (station_id)
    station_id,
    resolved_url,
    url
  FROM station_streams
  ORDER BY station_id, priority ASC, updated_at DESC
) AS primary_stream
WHERE primary_stream.station_id = s.id;

ALTER TABLE stations
ALTER COLUMN stream_url DROP DEFAULT;