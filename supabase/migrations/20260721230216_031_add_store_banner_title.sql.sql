ALTER TABLE users
  ADD COLUMN IF NOT EXISTS store_title text,
  ADD COLUMN IF NOT EXISTS store_banner_url text;
