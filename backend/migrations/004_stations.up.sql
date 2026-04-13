CREATE TABLE stations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id       TEXT        UNIQUE NOT NULL,          -- Radio Browser station UUID
  name              TEXT        NOT NULL,
  stream_url        TEXT        NOT NULL,
  homepage          TEXT        NOT NULL DEFAULT '',
  favicon           TEXT        NOT NULL DEFAULT '',
  genre             TEXT        NOT NULL DEFAULT '',
  language          TEXT        NOT NULL DEFAULT '',
  country           TEXT        NOT NULL DEFAULT '',
  country_code      TEXT        NOT NULL DEFAULT '',
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  bitrate           INT         NOT NULL DEFAULT 0,       -- kbps
  codec             TEXT        NOT NULL DEFAULT '',
  votes             INT         NOT NULL DEFAULT 0,       -- Radio Browser vote count
  click_count       INT         NOT NULL DEFAULT 0,
  reliability_score FLOAT       NOT NULL DEFAULT 0,      -- computed: 0.0–1.0
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  featured          BOOLEAN     NOT NULL DEFAULT false,
  last_checked_at   TIMESTAMPTZ,
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stations_genre_idx       ON stations (genre);
CREATE INDEX stations_country_idx     ON stations (country_code);
CREATE INDEX stations_active_idx      ON stations (is_active);
CREATE INDEX stations_featured_idx    ON stations (featured);
CREATE INDEX stations_reliability_idx ON stations (reliability_score DESC);
CREATE INDEX stations_name_search_idx ON stations USING gin(to_tsvector('simple', name));
