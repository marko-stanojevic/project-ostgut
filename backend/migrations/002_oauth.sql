-- Allow OAuth users who have no password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- OAuth identity columns
ALTER TABLE users ADD COLUMN oauth_provider    TEXT;
ALTER TABLE users ADD COLUMN oauth_provider_id TEXT;

-- One account per provider+id pair
CREATE UNIQUE INDEX users_oauth_idx
    ON users (oauth_provider, oauth_provider_id)
    WHERE oauth_provider IS NOT NULL;
