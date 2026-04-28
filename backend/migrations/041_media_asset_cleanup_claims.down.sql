DROP INDEX IF EXISTS media_assets_pending_expiry_idx;

ALTER TABLE media_assets
  DROP COLUMN IF EXISTS cleanup_claimed_at;
