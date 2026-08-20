/*
# Help Center, Tutorials, Challenges, Legal & Permissions — Database Foundation

## Summary
Creates the complete database foundation for the DRIGHT Help Center, Tutorials,
Challenges, Legal Pages, and Permissions Information systems. All content is
admin-managed and CMS-driven. Also creates the support_departments table to
complement the existing support_tickets system.

## New Tables

### Help System
1. `help_categories` — Categories for help articles and FAQs
   - name, slug, description, icon, sort_order, is_deleted

2. `help_articles` — Help center articles
   - category_id FK, title, slug, content (rich text), summary
   - tags, view_count, sort_order, status, is_published
   - publish_at, expire_at, created_by, updated_by

3. `faq_items` — FAQ entries with category assignment
   - category_id FK, question, answer, tags, sort_order, status, is_published

### Support System
4. `support_departments` — Configurable support contact departments
   - name, description, email, phone, whatsapp, telegram, messenger
   - live_chat_link, working_hours, avg_response_time, is_available
   - sort_order, is_deleted

### Tutorials
5. `tutorial_categories` — Tutorial categories (extensible)
   - name, slug, description, sort_order, is_deleted

6. `tutorials` — Tutorial/learning content with video
   - category_id FK, title, slug, description, content (rich text)
   - cover_image, thumbnail, video_type (youtube/vimeo/direct), video_url
   - video_thumbnail, duration_minutes, difficulty (beginner/intermediate/advanced)
   - tags, view_count, sort_order, status, is_published, publish_at
   - created_by, updated_by

### Challenges
7. `challenges` — User engagement challenges
   - title, description, banner_image, icon, reward_amount, reward_currency
   - reward_description, start_date, end_date, requirements (JSONB)
   - challenge_type, status (upcoming/active/completed/expired), is_active
   - sort_order, created_by

8. `challenge_progress` — Per-user challenge progress tracking
   - challenge_id FK, user_id, progress (0-100), is_completed, completed_at
   - reward_claimed, claimed_at

### Legal
9. `legal_pages` — Editable legal/policy pages
   - title, slug, page_type (terms/privacy/refund/vendor_agreement/etc)
   - content (rich text), is_published, publish_at, updated_at
   - version_number, created_by, updated_by

10. `policy_versions` — Version history for legal pages
    - legal_page_id FK, version_number, content, change_summary, created_by

### Permissions
11. `permission_information` — Editable permission explanation pages
    - permission_type (camera/gallery/storage/notifications/location/microphone)
    - title, description, image_url, video_url, is_enabled, sort_order

## Security
- RLS enabled on ALL tables.
- Public can read published content (for user-facing pages).
- Only authenticated admins (super_admin/admin/moderator) can create/update/delete.
- Users can read their own challenge_progress.
- Users can create their own challenge_progress entries.
- Uses existing admin role system via auth.uid() + users table role check.

## Important Notes
1. All tables use UUID primary keys with gen_random_uuid() defaults.
2. Soft deletes (is_deleted) on content tables.
3. Scheduling support (publish_at/expire_at) on articles, tutorials, announcements.
4. JSONB requirements field on challenges for flexible requirement definitions.
5. Version tracking on legal pages via policy_versions table.
6. Existing support_tickets and ticket_replies tables are NOT modified.
7. Existing announcements table is NOT modified — announcements admin page
   already exists and is extended separately.
*/

-- ============================================================
-- 1. help_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS help_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text DEFAULT 'HelpCircle',
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_help_categories_slug ON help_categories(slug);

DROP POLICY IF EXISTS "public_read_help_categories" ON help_categories;
CREATE POLICY "public_read_help_categories"
  ON help_categories FOR SELECT
  TO anon, authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "admin_insert_help_categories" ON help_categories;
CREATE POLICY "admin_insert_help_categories"
  ON help_categories FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_help_categories" ON help_categories;
CREATE POLICY "admin_update_help_categories"
  ON help_categories FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_help_categories" ON help_categories;
CREATE POLICY "admin_delete_help_categories"
  ON help_categories FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 2. help_articles
-- ============================================================
CREATE TABLE IF NOT EXISTS help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES help_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  summary text,
  tags text[] DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'hidden', 'archived')),
  is_published boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  expire_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_help_articles_slug ON help_articles(slug);
CREATE INDEX IF NOT EXISTS idx_help_articles_published ON help_articles(is_published, is_deleted);

DROP POLICY IF EXISTS "public_read_help_articles" ON help_articles;
CREATE POLICY "public_read_help_articles"
  ON help_articles FOR SELECT TO anon, authenticated
  USING (is_deleted = false AND is_published = true AND (publish_at IS NULL OR publish_at <= now()) AND (expire_at IS NULL OR expire_at > now()));

DROP POLICY IF EXISTS "admin_read_help_articles" ON help_articles;
CREATE POLICY "admin_read_help_articles"
  ON help_articles FOR SELECT TO authenticated
  USING (is_deleted = false AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_insert_help_articles" ON help_articles;
CREATE POLICY "admin_insert_help_articles"
  ON help_articles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_help_articles" ON help_articles;
CREATE POLICY "admin_update_help_articles"
  ON help_articles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_help_articles" ON help_articles;
CREATE POLICY "admin_delete_help_articles"
  ON help_articles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 3. faq_items
-- ============================================================
CREATE TABLE IF NOT EXISTS faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES help_categories(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  is_published boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_faq_items_category ON faq_items(category_id);
CREATE INDEX IF NOT EXISTS idx_faq_items_published ON faq_items(is_published, is_deleted);

DROP POLICY IF EXISTS "public_read_faq_items" ON faq_items;
CREATE POLICY "public_read_faq_items"
  ON faq_items FOR SELECT TO anon, authenticated
  USING (is_deleted = false AND is_published = true);

DROP POLICY IF EXISTS "admin_read_faq_items" ON faq_items;
CREATE POLICY "admin_read_faq_items"
  ON faq_items FOR SELECT TO authenticated
  USING (is_deleted = false AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_insert_faq_items" ON faq_items;
CREATE POLICY "admin_insert_faq_items"
  ON faq_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_faq_items" ON faq_items;
CREATE POLICY "admin_update_faq_items"
  ON faq_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_faq_items" ON faq_items;
CREATE POLICY "admin_delete_faq_items"
  ON faq_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 4. support_departments
-- ============================================================
CREATE TABLE IF NOT EXISTS support_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  email text,
  phone text,
  whatsapp text,
  telegram text,
  messenger text,
  live_chat_link text,
  working_hours text,
  avg_response_time text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_departments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_support_departments_sort ON support_departments(sort_order);

DROP POLICY IF EXISTS "public_read_support_departments" ON support_departments;
CREATE POLICY "public_read_support_departments"
  ON support_departments FOR SELECT TO anon, authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "admin_insert_support_departments" ON support_departments;
CREATE POLICY "admin_insert_support_departments"
  ON support_departments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_support_departments" ON support_departments;
CREATE POLICY "admin_update_support_departments"
  ON support_departments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_support_departments" ON support_departments;
CREATE POLICY "admin_delete_support_departments"
  ON support_departments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 5. tutorial_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS tutorial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tutorial_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tutorial_categories_slug ON tutorial_categories(slug);

DROP POLICY IF EXISTS "public_read_tutorial_categories" ON tutorial_categories;
CREATE POLICY "public_read_tutorial_categories"
  ON tutorial_categories FOR SELECT TO anon, authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "admin_insert_tutorial_categories" ON tutorial_categories;
CREATE POLICY "admin_insert_tutorial_categories"
  ON tutorial_categories FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_tutorial_categories" ON tutorial_categories;
CREATE POLICY "admin_update_tutorial_categories"
  ON tutorial_categories FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_tutorial_categories" ON tutorial_categories;
CREATE POLICY "admin_delete_tutorial_categories"
  ON tutorial_categories FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 6. tutorials
-- ============================================================
CREATE TABLE IF NOT EXISTS tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES tutorial_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  content text NOT NULL DEFAULT '',
  cover_image text,
  thumbnail text,
  video_type text NOT NULL DEFAULT 'youtube' CHECK (video_type IN ('youtube', 'vimeo', 'direct')),
  video_url text,
  video_thumbnail text,
  duration_minutes integer DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  tags text[] DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'hidden', 'archived')),
  is_published boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tutorials_category ON tutorials(category_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_slug ON tutorials(slug);
CREATE INDEX IF NOT EXISTS idx_tutorials_published ON tutorials(is_published, is_deleted);

DROP POLICY IF EXISTS "public_read_tutorials" ON tutorials;
CREATE POLICY "public_read_tutorials"
  ON tutorials FOR SELECT TO anon, authenticated
  USING (is_deleted = false AND is_published = true AND (publish_at IS NULL OR publish_at <= now()));

DROP POLICY IF EXISTS "admin_read_tutorials" ON tutorials;
CREATE POLICY "admin_read_tutorials"
  ON tutorials FOR SELECT TO authenticated
  USING (is_deleted = false AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_insert_tutorials" ON tutorials;
CREATE POLICY "admin_insert_tutorials"
  ON tutorials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_tutorials" ON tutorials;
CREATE POLICY "admin_update_tutorials"
  ON tutorials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_tutorials" ON tutorials;
CREATE POLICY "admin_delete_tutorials"
  ON tutorials FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 7. challenges
-- ============================================================
CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  banner_image text,
  icon text DEFAULT 'Trophy',
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_currency text DEFAULT 'NGN',
  reward_description text,
  start_date timestamptz,
  end_date timestamptz,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  challenge_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'expired')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, is_active, is_deleted);

DROP POLICY IF EXISTS "public_read_challenges" ON challenges;
CREATE POLICY "public_read_challenges"
  ON challenges FOR SELECT TO anon, authenticated
  USING (is_deleted = false AND is_active = true);

DROP POLICY IF EXISTS "admin_read_challenges" ON challenges;
CREATE POLICY "admin_read_challenges"
  ON challenges FOR SELECT TO authenticated
  USING (is_deleted = false AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_insert_challenges" ON challenges;
CREATE POLICY "admin_insert_challenges"
  ON challenges FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_challenges" ON challenges;
CREATE POLICY "admin_update_challenges"
  ON challenges FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_challenges" ON challenges;
CREATE POLICY "admin_delete_challenges"
  ON challenges FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 8. challenge_progress
-- ============================================================
CREATE TABLE IF NOT EXISTS challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  reward_claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_challenge_progress_user ON challenge_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge ON challenge_progress(challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_progress_unique ON challenge_progress(challenge_id, user_id);

DROP POLICY IF EXISTS "user_read_own_progress" ON challenge_progress;
CREATE POLICY "user_read_own_progress"
  ON challenge_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_insert_own_progress" ON challenge_progress;
CREATE POLICY "user_insert_own_progress"
  ON challenge_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_update_own_progress" ON challenge_progress;
CREATE POLICY "user_update_own_progress"
  ON challenge_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_challenge_progress" ON challenge_progress;
CREATE POLICY "admin_read_challenge_progress"
  ON challenge_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

DROP POLICY IF EXISTS "admin_update_challenge_progress" ON challenge_progress;
CREATE POLICY "admin_update_challenge_progress"
  ON challenge_progress FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 9. legal_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  page_type text NOT NULL DEFAULT 'terms' CHECK (page_type IN ('terms', 'privacy', 'refund', 'vendor_agreement', 'affiliate_agreement', 'buyer_rules', 'seller_rules', 'community_guidelines', 'kyc_policy', 'advertising_policy')),
  content text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  version_number integer NOT NULL DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legal_pages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_legal_pages_slug ON legal_pages(slug);
CREATE INDEX IF NOT EXISTS idx_legal_pages_type ON legal_pages(page_type);

DROP POLICY IF EXISTS "public_read_legal_pages" ON legal_pages;
CREATE POLICY "public_read_legal_pages"
  ON legal_pages FOR SELECT TO anon, authenticated
  USING (is_deleted = false AND is_published = true);

DROP POLICY IF EXISTS "admin_read_legal_pages" ON legal_pages;
CREATE POLICY "admin_read_legal_pages"
  ON legal_pages FOR SELECT TO authenticated
  USING (is_deleted = false AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_insert_legal_pages" ON legal_pages;
CREATE POLICY "admin_insert_legal_pages"
  ON legal_pages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_legal_pages" ON legal_pages;
CREATE POLICY "admin_update_legal_pages"
  ON legal_pages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_legal_pages" ON legal_pages;
CREATE POLICY "admin_delete_legal_pages"
  ON legal_pages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 10. policy_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_page_id uuid NOT NULL REFERENCES legal_pages(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL DEFAULT '',
  change_summary text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_policy_versions_page ON policy_versions(legal_page_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_page_version ON policy_versions(legal_page_id, version_number DESC);

DROP POLICY IF EXISTS "public_read_policy_versions" ON policy_versions;
CREATE POLICY "public_read_policy_versions"
  ON policy_versions FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_policy_versions" ON policy_versions;
CREATE POLICY "admin_insert_policy_versions"
  ON policy_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_policy_versions" ON policy_versions;
CREATE POLICY "admin_delete_policy_versions"
  ON policy_versions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- 11. permission_information
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_type text NOT NULL CHECK (permission_type IN ('camera', 'gallery', 'storage', 'notifications', 'location', 'microphone')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  video_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE permission_information ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_permission_info_type ON permission_information(permission_type);

DROP POLICY IF EXISTS "public_read_permission_info" ON permission_information;
CREATE POLICY "public_read_permission_info"
  ON permission_information FOR SELECT TO anon, authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "admin_insert_permission_info" ON permission_information;
CREATE POLICY "admin_insert_permission_info"
  ON permission_information FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_update_permission_info" ON permission_information;
CREATE POLICY "admin_update_permission_info"
  ON permission_information FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin', 'moderator')));

DROP POLICY IF EXISTS "admin_delete_permission_info" ON permission_information;
CREATE POLICY "admin_delete_permission_info"
  ON permission_information FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')));

-- ============================================================
-- Updated_at triggers (shared function)
-- ============================================================
CREATE OR REPLACE FUNCTION content_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS help_categories_updated_at ON help_categories;
CREATE TRIGGER help_categories_updated_at BEFORE UPDATE ON help_categories
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS help_articles_updated_at ON help_articles;
CREATE TRIGGER help_articles_updated_at BEFORE UPDATE ON help_articles
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS faq_items_updated_at ON faq_items;
CREATE TRIGGER faq_items_updated_at BEFORE UPDATE ON faq_items
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS support_departments_updated_at ON support_departments;
CREATE TRIGGER support_departments_updated_at BEFORE UPDATE ON support_departments
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS tutorial_categories_updated_at ON tutorial_categories;
CREATE TRIGGER tutorial_categories_updated_at BEFORE UPDATE ON tutorial_categories
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS tutorials_updated_at ON tutorials;
CREATE TRIGGER tutorials_updated_at BEFORE UPDATE ON tutorials
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS challenges_updated_at ON challenges;
CREATE TRIGGER challenges_updated_at BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS challenge_progress_updated_at ON challenge_progress;
CREATE TRIGGER challenge_progress_updated_at BEFORE UPDATE ON challenge_progress
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS legal_pages_updated_at ON legal_pages;
CREATE TRIGGER legal_pages_updated_at BEFORE UPDATE ON legal_pages
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

DROP TRIGGER IF EXISTS permission_information_updated_at ON permission_information;
CREATE TRIGGER permission_information_updated_at BEFORE UPDATE ON permission_information
  FOR EACH ROW EXECUTE FUNCTION content_set_updated_at();

-- ============================================================
-- Seed default help categories
-- ============================================================
INSERT INTO help_categories (name, slug, description, icon, sort_order)
VALUES
  ('Getting Started', 'getting-started', 'Basic setup and onboarding', 'Rocket', 1),
  ('Account', 'account', 'Account management and settings', 'User', 2),
  ('Buying', 'buying', 'How to browse and purchase products', 'ShoppingCart', 3),
  ('Selling', 'selling', 'How to list and sell products', 'Tag', 4),
  ('Payments', 'payments', 'Payment methods and processing', 'CreditCard', 5),
  ('Wallet', 'wallet', 'Wallet balance and transactions', 'Wallet', 6),
  ('Withdrawals', 'withdrawals', 'Withdrawing your earnings', 'Banknote', 7),
  ('Affiliates', 'affiliates', 'Affiliate program details', 'Users', 8),
  ('Referrals', 'referrals', 'Referral system guide', 'Gift', 9),
  ('Promotions', 'promotions', 'Promotional campaigns', 'Megaphone', 10),
  ('Security', 'security', 'Account security best practices', 'Shield', 11),
  ('Verification', 'verification', 'Identity verification process', 'BadgeCheck', 12)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Seed default tutorial categories
-- ============================================================
INSERT INTO tutorial_categories (name, slug, description, sort_order)
VALUES
  ('Getting Started', 'getting-started', 'Learn the basics of DRIGHT', 1),
  ('Creating an Account', 'creating-account', 'How to sign up and verify', 2),
  ('Buying Products', 'buying-products', 'How to browse and purchase', 3),
  ('Selling Products', 'selling-products', 'How to list and sell', 4),
  ('Posting Services', 'posting-services', 'How to offer services', 5),
  ('Posting Jobs', 'posting-jobs', 'How to post job listings', 6),
  ('Affiliate Marketing', 'affiliate-marketing', 'Affiliate program tutorials', 7),
  ('Referral Program', 'referral-program', 'Referral system tutorials', 8),
  ('Wallet & Payments', 'wallet-payments', 'Wallet and payment guides', 9),
  ('Withdrawals', 'withdrawals', 'How to withdraw earnings', 10),
  ('Promotions', 'promotions', 'Promotional tools and campaigns', 11),
  ('Security', 'security', 'Security best practices', 12),
  ('Marketplace Tips', 'marketplace-tips', 'Tips for marketplace success', 13)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Seed default legal pages (drafts)
-- ============================================================
INSERT INTO legal_pages (title, slug, page_type, content, is_published, version_number)
VALUES
  ('Terms of Service', 'terms-of-service', 'terms', '<h1>Terms of Service</h1><p>This page is editable through the admin dashboard. Replace this placeholder content with your terms of service.</p>', false, 1),
  ('Privacy Policy', 'privacy-policy', 'privacy', '<h1>Privacy Policy</h1><p>This page is editable through the admin dashboard. Replace this placeholder content with your privacy policy.</p>', false, 1),
  ('Refund Policy', 'refund-policy', 'refund', '<h1>Refund Policy</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Vendor Agreement', 'vendor-agreement', 'vendor_agreement', '<h1>Vendor Agreement</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Affiliate Agreement', 'affiliate-agreement', 'affiliate_agreement', '<h1>Affiliate Agreement</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Buyer Rules', 'buyer-rules', 'buyer_rules', '<h1>Buyer Rules</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Seller Rules', 'seller-rules', 'seller_rules', '<h1>Seller Rules</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Community Guidelines', 'community-guidelines', 'community_guidelines', '<h1>Community Guidelines</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('KYC Policy', 'kyc-policy', 'kyc_policy', '<h1>KYC Policy</h1><p>This page is editable through the admin dashboard.</p>', false, 1),
  ('Advertising Policy', 'advertising-policy', 'advertising_policy', '<h1>Advertising Policy</h1><p>This page is editable through the admin dashboard.</p>', false, 1)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Seed default permission information
-- ============================================================
INSERT INTO permission_information (permission_type, title, description, sort_order)
VALUES
  ('camera', 'Camera Permission', 'DRIGHT uses camera access for product photos, profile pictures, and video calls. You can grant or revoke this permission at any time in your device settings.', 1),
  ('gallery', 'Gallery Permission', 'Gallery access allows you to upload product images, profile photos, and media to your store. This permission can be managed in your device settings.', 2),
  ('storage', 'Storage Permission', 'Storage permission lets DRIGHT save downloaded files, cache images, and store temporary data on your device for faster loading.', 3),
  ('notifications', 'Notification Permission', 'Notifications keep you informed about orders, messages, announcements, and important updates. You can customize which notifications you receive in Settings.', 4),
  ('location', 'Location Permission', 'Location access enables local marketplace features, nearby services, and delivery estimates. This permission is optional and can be disabled.', 5),
  ('microphone', 'Microphone Permission', 'Microphone access is used for voice messages in chat, video calls, and voice search features. You can revoke this permission at any time.', 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Seed default support departments
-- ============================================================
INSERT INTO support_departments (name, description, email, working_hours, avg_response_time, is_available, sort_order)
VALUES
  ('Customer Care', 'General inquiries and account support', 'support@dright.com', 'Mon-Fri 9:00 AM - 6:00 PM (WAT)', 'Within 24 hours', true, 1),
  ('Vendor Support', 'Help for sellers and store owners', 'vendors@dright.com', 'Mon-Fri 9:00 AM - 6:00 PM (WAT)', 'Within 12 hours', true, 2),
  ('Affiliate Support', 'Affiliate program and commission help', 'affiliates@dright.com', 'Mon-Fri 9:00 AM - 6:00 PM (WAT)', 'Within 24 hours', true, 3),
  ('Payment Support', 'Payment and wallet transaction help', 'payments@dright.com', 'Mon-Sat 9:00 AM - 8:00 PM (WAT)', 'Within 6 hours', true, 4),
  ('Technical Support', 'Bug reports and technical issues', 'tech@dright.com', 'Mon-Sun 24 hours', 'Within 48 hours', true, 5),
  ('Advertising Support', 'Ads and promotional campaigns', 'ads@dright.com', 'Mon-Fri 9:00 AM - 6:00 PM (WAT)', 'Within 24 hours', true, 6),
  ('Security Team', 'Security reports and account breaches', 'security@dright.com', 'Mon-Sun 24 hours', 'Within 2 hours', true, 7)
ON CONFLICT DO NOTHING;
