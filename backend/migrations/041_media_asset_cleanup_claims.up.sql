ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS media_assets_pending_expiry_idx
  ON media_assets (expires_at)
  WHERE status = 'pending' AND cleanup_claimed_at IS NULL;
