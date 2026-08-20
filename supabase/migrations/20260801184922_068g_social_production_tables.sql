/*
# Social System Production Tables (fix — privacy_following typo)

1. New Tables: user_blocks, user_reports, user_achievements, user_verifications, social_notifications
2. Users table: adds verification_level, privacy columns, profession, skills, brand, company_name
3. All with proper RLS
*/

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_blocks" ON user_blocks;
CREATE POLICY "select_own_blocks" ON user_blocks FOR SELECT
  TO authenticated USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "insert_own_block" ON user_blocks;
CREATE POLICY "insert_own_block" ON user_blocks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "delete_own_block" ON user_blocks;
CREATE POLICY "delete_own_block" ON user_blocks FOR DELETE
  TO authenticated USING (auth.uid() = blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reports" ON user_reports;
CREATE POLICY "select_reports" ON user_reports FOR SELECT
  TO authenticated USING (auth.uid() = reporter_id OR auth.uid() = reported_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_admin = true OR role IN ('admin','super_admin','moderator'))));

DROP POLICY IF EXISTS "insert_own_report" ON user_reports;
CREATE POLICY "insert_own_report" ON user_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "update_admin_report" ON user_reports;
CREATE POLICY "update_admin_report" ON user_reports FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_admin = true OR role IN ('admin','super_admin','moderator')))) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status);

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achievement_name text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  earned_at timestamptz DEFAULT now()
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_achievements" ON user_achievements;
CREATE POLICY "select_achievements" ON user_achievements FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_achievement" ON user_achievements;
CREATE POLICY "insert_own_achievement" ON user_achievements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id, earned_at DESC);

CREATE TABLE IF NOT EXISTS user_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  verification_type text NOT NULL CHECK (verification_type IN ('email','phone','identity','business','creator','trusted_seller','top_affiliate','premium')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','expired')),
  verified_by uuid REFERENCES users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  UNIQUE(user_id, verification_type)
);

ALTER TABLE user_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_verifications" ON user_verifications;
CREATE POLICY "select_verifications" ON user_verifications FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_verification" ON user_verifications;
CREATE POLICY "insert_own_verification" ON user_verifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_admin_verification" ON user_verifications;
CREATE POLICY "update_admin_verification" ON user_verifications FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_admin = true OR role IN ('admin','super_admin','moderator')))) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_verifications_user ON user_verifications(user_id);

CREATE TABLE IF NOT EXISTS social_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_social_notifs" ON social_notifications;
CREATE POLICY "select_own_social_notifs" ON social_notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_social_notif" ON social_notifications;
CREATE POLICY "insert_social_notif" ON social_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_social_notif" ON social_notifications;
CREATE POLICY "update_own_social_notif" ON social_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_social_notif" ON social_notifications;
CREATE POLICY "delete_own_social_notif" ON social_notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_social_notifs_user ON social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_notifs_unread ON social_notifications(user_id, read);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'verification_level') THEN
    ALTER TABLE users ADD COLUMN verification_level text DEFAULT 'unverified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_profile') THEN
    ALTER TABLE users ADD COLUMN privacy_profile text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_email') THEN
    ALTER TABLE users ADD COLUMN privacy_email text DEFAULT 'private';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_phone') THEN
    ALTER TABLE users ADD COLUMN privacy_phone text DEFAULT 'private';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_followers') THEN
    ALTER TABLE users ADD COLUMN privacy_followers text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_following') THEN
    ALTER TABLE users ADD COLUMN privacy_following text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_portfolio') THEN
    ALTER TABLE users ADD COLUMN privacy_portfolio text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_analytics') THEN
    ALTER TABLE users ADD COLUMN privacy_analytics text DEFAULT 'private';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'privacy_activity') THEN
    ALTER TABLE users ADD COLUMN privacy_activity text DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profession') THEN
    ALTER TABLE users ADD COLUMN profession text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'skills') THEN
    ALTER TABLE users ADD COLUMN skills text[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'brand') THEN
    ALTER TABLE users ADD COLUMN brand text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'company_name') THEN
    ALTER TABLE users ADD COLUMN company_name text;
  END IF;
END $$;
