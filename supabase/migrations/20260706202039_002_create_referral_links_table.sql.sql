/*
# Create referral_links table

1. Purpose
- Stores unique referral codes for each promoter to share with potential buyers.
- Tracks total clicks and conversions for analytics.

2. New Tables
- `referral_links`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, references auth.users, defaults to auth.uid())
  - `unique_code` (text, unique, not null) - the shareable code
  - `total_clicks` (integer, default 0)
  - `total_conversions` (integer, default 0)
  - `created_at` (timestamptz, default now())

3. Security (RLS)
- Enable RLS.
- Promoters can read and update only their own referral link.
- The unique_code is generated automatically on insert using a trigger.

4. Notes
- A trigger generates a unique 8-character code on insert.
- user_id defaults to auth.uid() so inserts work without specifying it.
*/

CREATE TABLE IF NOT EXISTS referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  unique_code text UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 8)),
  total_clicks integer DEFAULT 0,
  total_conversions integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_links_user_id ON referral_links(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_links_unique_code ON referral_links(unique_code);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promoters can read own referral link" ON referral_links;
CREATE POLICY "Promoters can read own referral link"
ON referral_links FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Promoters can insert own referral link" ON referral_links;
CREATE POLICY "Promoters can insert own referral link"
ON referral_links FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Promoters can update own referral link" ON referral_links;
CREATE POLICY "Promoters can update own referral link"
ON referral_links FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);