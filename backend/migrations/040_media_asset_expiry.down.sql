DROP INDEX IF EXISTS media_assets_pending_expiry_idx;

ALTER TABLE media_assets
  DROP COLUMN cleanup_claimed_at,
  DROP COLUMN expires_at;
