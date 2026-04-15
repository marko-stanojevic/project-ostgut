CREATE TABLE IF NOT EXISTS media_assets (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type           TEXT        NOT NULL CHECK (owner_type IN ('user', 'station')),
  owner_id             UUID        NOT NULL,
  kind                 TEXT        NOT NULL CHECK (kind IN ('avatar', 'station_icon')),
  storage_key_original TEXT        NOT NULL,
  variants             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  mime_type            TEXT        NOT NULL DEFAULT '',
  width                INT,
  height               INT,
  byte_size            BIGINT,
  content_hash         TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected')),
  rejection_reason     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_assets_owner_kind_idx
  ON media_assets (owner_type, owner_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_status_idx
  ON media_assets (status);

CREATE INDEX IF NOT EXISTS media_assets_hash_idx
  ON media_assets (content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS icon_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_avatar_asset_id_idx ON users (avatar_asset_id);
CREATE INDEX IF NOT EXISTS stations_icon_asset_id_idx ON stations (icon_asset_id);
