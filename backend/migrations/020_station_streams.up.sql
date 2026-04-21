CREATE TABLE station_streams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  resolved_url    TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'playlist', 'hls')),
  container       TEXT NOT NULL DEFAULT 'none' CHECK (container IN ('none', 'm3u', 'm3u8', 'pls')),
  transport       TEXT NOT NULL DEFAULT 'http' CHECK (transport IN ('http', 'https', 'icy', 'shoutcast', 'icecast')),
  mime_type       TEXT NOT NULL DEFAULT '',
  codec           TEXT NOT NULL DEFAULT '',
  bitrate         INT NOT NULL DEFAULT 0,
  priority        INT NOT NULL DEFAULT 1 CHECK (priority > 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  health_score    DOUBLE PRECISION NOT NULL DEFAULT 0.8 CHECK (health_score >= 0 AND health_score <= 1),
  last_checked_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, priority)
);

CREATE INDEX station_streams_station_priority_idx ON station_streams (station_id, priority);
CREATE INDEX station_streams_station_active_idx ON station_streams (station_id, is_active);

INSERT INTO station_streams (
  station_id,
  url,
  resolved_url,
  kind,
  container,
  transport,
  mime_type,
  codec,
  bitrate,
  priority,
  is_active,
  health_score,
  last_checked_at
)
SELECT
  s.id,
  s.stream_url,
  s.stream_url,
  CASE
    WHEN lower(split_part(s.stream_url, '?', 1)) LIKE '%.m3u8' THEN 'hls'
    WHEN lower(split_part(s.stream_url, '?', 1)) LIKE '%.m3u' OR lower(split_part(s.stream_url, '?', 1)) LIKE '%.pls' THEN 'playlist'
    ELSE 'direct'
  END,
  CASE
    WHEN lower(split_part(s.stream_url, '?', 1)) LIKE '%.m3u8' THEN 'm3u8'
    WHEN lower(split_part(s.stream_url, '?', 1)) LIKE '%.m3u' THEN 'm3u'
    WHEN lower(split_part(s.stream_url, '?', 1)) LIKE '%.pls' THEN 'pls'
    ELSE 'none'
  END,
  CASE
    WHEN lower(s.stream_url) LIKE 'https://%' THEN 'https'
    ELSE 'http'
  END,
  '',
  upper(coalesce(s.codec, '')),
  coalesce(s.bitrate, 0),
  1,
  true,
  greatest(0, least(1, coalesce(s.reliability_score, 0.8))),
  NOW()
FROM stations s
WHERE s.stream_url IS NOT NULL AND trim(s.stream_url) <> ''
ON CONFLICT (station_id, priority) DO NOTHING;
