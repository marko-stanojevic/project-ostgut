-- Ensure all stored emails are canonical lowercase and trimmed.
UPDATE users
SET email = lower(trim(email));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_canonical_check;
ALTER TABLE users ADD CONSTRAINT users_email_canonical_check
CHECK (email = lower(email) AND email = btrim(email));
