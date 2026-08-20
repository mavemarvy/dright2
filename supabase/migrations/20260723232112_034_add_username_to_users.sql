/*
# Add username column to users table

1. Changes
- Adds `username` column to the `users` table (text, unique, not null after backfill).
- Adds a unique index on `username` to enforce uniqueness.

2. Security
- No RLS policy changes; existing users-table policies still govern access.
- Username is public-facing but only the owner can set/update it via existing UPDATE policy.

3. Notes
- Column added as nullable first so existing rows don't violate NOT NULL.
- Existing rows get a default username derived from their email prefix.
- Duplicates are made unique by appending a short id suffix.
- NOT NULL is enforced after backfill.
- This supports username-based login: the frontend looks up the email by username, then calls supabase.auth.signInWithPassword with that email.
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;

-- Backfill existing rows with a username derived from email prefix
UPDATE users
SET username = split_part(email, '@', 1)
WHERE username IS NULL;

-- Ensure uniqueness for duplicates by appending a short id suffix
UPDATE users u
SET username = u.username || '_' || left(u.id::text, 4)
WHERE username IS NOT NULL
  AND u.id::text <> (
    SELECT min(id::text) FROM users u2 WHERE u2.username = u.username
  );

-- Enforce NOT NULL now that all rows have a value
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Unique index to prevent duplicate usernames
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);
