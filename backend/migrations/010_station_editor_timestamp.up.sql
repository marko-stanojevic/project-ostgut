ALTER TABLE stations ADD COLUMN IF NOT EXISTS last_editor_action_at TIMESTAMPTZ;

-- Backfill: any station that has already been acted on editorially gets its
-- last_editor_action_at set to updated_at so it is included in the first sync.
UPDATE stations
SET last_editor_action_at = updated_at
WHERE status != 'pending'
   OR featured = true
   OR custom_name IS NOT NULL
   OR custom_website IS NOT NULL
   OR custom_description IS NOT NULL
   OR editor_notes IS NOT NULL
   OR external_id LIKE 'manual:%';
