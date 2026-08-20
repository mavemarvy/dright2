ALTER TABLE users
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS store_theme jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS store_location text;
