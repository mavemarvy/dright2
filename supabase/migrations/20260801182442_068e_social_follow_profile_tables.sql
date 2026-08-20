/*
# Social Follow System + Profile Views

1. New Tables
- user_follows: follower/following relationships with unique constraint and self-follow prevention
- profile_views: tracks who viewed a profile with geo/device metadata

2. Existing Tables Modified
- users: adds cover_image, bio, website, show_email, show_phone, languages, last_active, is_online columns (idempotent)

3. Security
- user_follows: SELECT public, INSERT/DELETE own only
- profile_views: SELECT own profile only, INSERT anyone
*/

CREATE TABLE IF NOT EXISTS user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_follows" ON user_follows;
CREATE POLICY "select_follows" ON user_follows FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_follow" ON user_follows;
CREATE POLICY "insert_own_follow" ON user_follows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "delete_own_follow" ON user_follows;
CREATE POLICY "delete_own_follow" ON user_follows FOR DELETE
  TO authenticated USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);

CREATE TABLE IF NOT EXISTS profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id uuid,
  session_id text,
  source text DEFAULT 'direct',
  device_type text,
  country text,
  city text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile_views" ON profile_views;
CREATE POLICY "select_own_profile_views" ON profile_views FOR SELECT
  TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS "insert_profile_view" ON profile_views;
CREATE POLICY "insert_profile_view" ON profile_views FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_profile_views_profile ON profile_views(profile_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cover_image') THEN
    ALTER TABLE users ADD COLUMN cover_image text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bio') THEN
    ALTER TABLE users ADD COLUMN bio text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'website') THEN
    ALTER TABLE users ADD COLUMN website text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'show_email') THEN
    ALTER TABLE users ADD COLUMN show_email boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'show_phone') THEN
    ALTER TABLE users ADD COLUMN show_phone boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'languages') THEN
    ALTER TABLE users ADD COLUMN languages text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_active') THEN
    ALTER TABLE users ADD COLUMN last_active timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_online') THEN
    ALTER TABLE users ADD COLUMN is_online boolean DEFAULT false;
  END IF;
END $$;
