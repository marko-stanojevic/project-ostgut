-- Enforce case-insensitive uniqueness for user emails and normalize existing rows.
-- If duplicates differ only by letter case, keep one canonical user and move references.

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS keep_id
  FROM users
), dups AS (
  SELECT id, keep_id
  FROM ranked
  WHERE rn > 1
)
-- Keep one subscription row per canonical user and remove duplicate-user subscriptions.
DELETE FROM subscriptions s
USING dups d
WHERE s.user_id = d.id
  AND EXISTS (
    SELECT 1
    FROM subscriptions k
    WHERE k.user_id = d.keep_id
  );

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS keep_id
  FROM users
), dups AS (
  SELECT id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE subscriptions s
SET user_id = d.keep_id
FROM dups d
WHERE s.user_id = d.id;

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS keep_id
  FROM users
), dups AS (
  SELECT id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE password_reset_tokens t
SET user_id = d.keep_id
FROM dups d
WHERE t.user_id = d.id;

WITH ranked AS (
  SELECT
    id,
    lower(email) AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email)
      ORDER BY is_admin DESC, created_at ASC, id ASC
    ) AS rn
  FROM users
), dups AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
DELETE FROM users u
USING dups d
WHERE u.id = d.id;

UPDATE users
SET email = lower(trim(email));

-- Replace case-sensitive unique constraint with case-insensitive unique index.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
