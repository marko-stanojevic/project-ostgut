-- Replace boolean is_admin with a role enum stored as text + check constraint.
-- Roles: 'user' (default), 'editor' (curate stations), 'admin' (full access).
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

UPDATE users SET role = 'admin' WHERE is_admin = true;

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'editor', 'admin'));

ALTER TABLE users DROP COLUMN is_admin;

CREATE INDEX users_role_idx ON users (role);
