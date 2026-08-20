/*
# CMS Foundation — Dynamic Content Management System

## Summary
Creates the complete database foundation for a dynamic CMS that allows administrators
to control website content (welcome page, marketplace home, help center, tutorials,
announcements, landing pages, etc.) without modifying source code.

## New Tables
1. `cms_pages` — Top-level CMS pages (welcome, marketplace_home, help_center, etc.)
   - slug, title, page_type, status (draft/published/scheduled/hidden/archived)
   - SEO metadata (meta_title, meta_description, meta_keywords, og_title, og_description, og_image, canonical_url)
   - publish_at / expire_at for scheduling with timezone awareness
   - sort_order, is_deleted (soft delete), created_by, updated_by

2. `cms_blocks` — Individual content blocks placed on pages (hero, banner, text, image, video, card, faq, countdown, divider)
   - page_id FK to cms_pages
   - block_type, block_data (JSONB — flexible per-type config)
   - status, sort_order, is_hidden, is_deleted
   - publish_at / expire_at for block-level scheduling

3. `cms_media` — Centralized media library (images, videos, documents, PDFs, icons)
   - filename, file_url, file_type, mime_type, file_size
   - folder, tags (array), alt_text
   - is_deleted (soft delete)

4. `cms_page_versions` — Version history for every page edit
   - page_id FK, version_number, snapshot (JSONB of full page+blocks state)
   - change_summary, created_by

5. `cms_navigation` — Homepage layout editor / nav ordering
   - page_key, section_key, sort_order, is_hidden

6. `cms_visibility_rules` — Per-block and per-page visibility controls
   - target_type (page or block), target_id
   - user_role, country, device_type (future-ready columns)
   - is_visible

7. `cms_button_actions` — Configurable buttons/CTAs
   - block_id FK (nullable — can be standalone)
   - button_text, internal_link, external_link, open_in_new_tab
   - is_hidden, is_disabled, button_style (primary/secondary/outline)

## Security
- RLS enabled on ALL tables.
- Public can read published content (status = 'published' and within schedule dates).
- Only authenticated admins can create/update/delete.
- Uses existing admin role system via auth.uid() + users table role check.
- Soft deletes (is_deleted = true) filtered in policies.

## Important Notes
1. All tables use UUID primary keys with gen_random_uuid() defaults.
2. created_by / updated_by default to auth.uid().
3. sort_order defaults to 0 for easy reordering.
4. JSONB block_data allows flexible per-block-type configuration without schema changes.
5. Future block types can be added without migrations — just new block_type values.
6. Visibility rules support future country/device targeting via nullable columns.
*/

-- ============================================================
-- 1. cms_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  page_type text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'scheduled', 'hidden', 'archived')),
  meta_title text,
  meta_description text,
  meta_keywords text[],
  og_title text,
  og_description text,
  og_image text,
  canonical_url text,
  publish_at timestamptz,
  expire_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

-- Public can read published, non-deleted pages within schedule
DROP POLICY IF EXISTS "public_read_cms_pages" ON cms_pages;
CREATE POLICY "public_read_cms_pages"
  ON cms_pages FOR SELECT
  TO anon, authenticated
  USING (
    is_deleted = false
    AND status = 'published'
    AND (publish_at IS NULL OR publish_at <= now())
    AND (expire_at IS NULL OR expire_at > now())
  );

-- Admins can read all pages (including drafts, archived)
DROP POLICY IF EXISTS "admin_read_cms_pages" ON cms_pages;
CREATE POLICY "admin_read_cms_pages"
  ON cms_pages FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

-- Admins can insert/update/delete pages
DROP POLICY IF EXISTS "admin_insert_cms_pages" ON cms_pages;
CREATE POLICY "admin_insert_cms_pages"
  ON cms_pages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_pages" ON cms_pages;
CREATE POLICY "admin_update_cms_pages"
  ON cms_pages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_pages" ON cms_pages;
CREATE POLICY "admin_delete_cms_pages"
  ON cms_pages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 2. cms_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  block_type text NOT NULL
    CHECK (block_type IN ('hero', 'banner', 'text', 'image', 'video', 'card', 'faq', 'countdown', 'divider')),
  block_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'scheduled', 'hidden', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  expire_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_blocks_page_id ON cms_blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_blocks_sort_order ON cms_blocks(page_id, sort_order);

-- Public can read published, visible, non-deleted blocks on published pages
DROP POLICY IF EXISTS "public_read_cms_blocks" ON cms_blocks;
CREATE POLICY "public_read_cms_blocks"
  ON cms_blocks FOR SELECT
  TO anon, authenticated
  USING (
    is_deleted = false
    AND is_hidden = false
    AND status = 'published'
    AND (publish_at IS NULL OR publish_at <= now())
    AND (expire_at IS NULL OR expire_at > now())
  );

-- Admins can read all blocks
DROP POLICY IF EXISTS "admin_read_cms_blocks" ON cms_blocks;
CREATE POLICY "admin_read_cms_blocks"
  ON cms_blocks FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_insert_cms_blocks" ON cms_blocks;
CREATE POLICY "admin_insert_cms_blocks"
  ON cms_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_blocks" ON cms_blocks;
CREATE POLICY "admin_update_cms_blocks"
  ON cms_blocks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_blocks" ON cms_blocks;
CREATE POLICY "admin_delete_cms_blocks"
  ON cms_blocks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 3. cms_media
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL
    CHECK (file_type IN ('image', 'video', 'document', 'pdf', 'icon')),
  mime_type text,
  file_size bigint DEFAULT 0,
  folder text DEFAULT 'root',
  tags text[] DEFAULT '{}',
  alt_text text,
  width integer,
  height integer,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_media ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_media_folder ON cms_media(folder);
CREATE INDEX IF NOT EXISTS idx_cms_media_file_type ON cms_media(file_type);

-- Public can read media (needed for rendering CMS content)
DROP POLICY IF EXISTS "public_read_cms_media" ON cms_media;
CREATE POLICY "public_read_cms_media"
  ON cms_media FOR SELECT
  TO anon, authenticated
  USING (is_deleted = false);

DROP POLICY IF EXISTS "admin_insert_cms_media" ON cms_media;
CREATE POLICY "admin_insert_cms_media"
  ON cms_media FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_media" ON cms_media;
CREATE POLICY "admin_update_cms_media"
  ON cms_media FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_media" ON cms_media;
CREATE POLICY "admin_delete_cms_media"
  ON cms_media FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 4. cms_page_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_summary text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_page_versions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_page_versions_page_id ON cms_page_versions(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_versions_page_version ON cms_page_versions(page_id, version_number DESC);

-- Public can read version history (for transparency)
DROP POLICY IF EXISTS "public_read_cms_page_versions" ON cms_page_versions;
CREATE POLICY "public_read_cms_page_versions"
  ON cms_page_versions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_cms_page_versions" ON cms_page_versions;
CREATE POLICY "admin_insert_cms_page_versions"
  ON cms_page_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_page_versions" ON cms_page_versions;
CREATE POLICY "admin_delete_cms_page_versions"
  ON cms_page_versions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 5. cms_navigation
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_navigation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key text NOT NULL,
  section_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_navigation ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_nav_page_key ON cms_navigation(page_key);
CREATE INDEX IF NOT EXISTS idx_cms_nav_sort ON cms_navigation(page_key, sort_order);

-- Public can read visible navigation
DROP POLICY IF EXISTS "public_read_cms_navigation" ON cms_navigation;
CREATE POLICY "public_read_cms_navigation"
  ON cms_navigation FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);

DROP POLICY IF EXISTS "admin_read_cms_navigation" ON cms_navigation;
CREATE POLICY "admin_read_cms_navigation"
  ON cms_navigation FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_cms_navigation" ON cms_navigation;
CREATE POLICY "admin_insert_cms_navigation"
  ON cms_navigation FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_navigation" ON cms_navigation;
CREATE POLICY "admin_update_cms_navigation"
  ON cms_navigation FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_navigation" ON cms_navigation;
CREATE POLICY "admin_delete_cms_navigation"
  ON cms_navigation FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 6. cms_visibility_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_visibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('page', 'block')),
  target_id uuid NOT NULL,
  user_role text,
  country text,
  device_type text,
  is_visible boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_visibility_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_visibility_target ON cms_visibility_rules(target_type, target_id);

-- Public can read visibility rules (needed for rendering decisions)
DROP POLICY IF EXISTS "public_read_cms_visibility_rules" ON cms_visibility_rules;
CREATE POLICY "public_read_cms_visibility_rules"
  ON cms_visibility_rules FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_cms_visibility_rules" ON cms_visibility_rules;
CREATE POLICY "admin_insert_cms_visibility_rules"
  ON cms_visibility_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_visibility_rules" ON cms_visibility_rules;
CREATE POLICY "admin_update_cms_visibility_rules"
  ON cms_visibility_rules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_visibility_rules" ON cms_visibility_rules;
CREATE POLICY "admin_delete_cms_visibility_rules"
  ON cms_visibility_rules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 7. cms_button_actions
-- ============================================================
CREATE TABLE IF NOT EXISTS cms_button_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid REFERENCES cms_blocks(id) ON DELETE CASCADE,
  button_text text NOT NULL,
  internal_link text,
  external_link text,
  open_in_new_tab boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  is_disabled boolean NOT NULL DEFAULT false,
  button_style text NOT NULL DEFAULT 'primary'
    CHECK (button_style IN ('primary', 'secondary', 'outline')),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cms_button_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_button_actions_block_id ON cms_button_actions(block_id);

-- Public can read non-hidden buttons
DROP POLICY IF EXISTS "public_read_cms_button_actions" ON cms_button_actions;
CREATE POLICY "public_read_cms_button_actions"
  ON cms_button_actions FOR SELECT
  TO anon, authenticated
  USING (is_hidden = false);

DROP POLICY IF EXISTS "admin_insert_cms_button_actions" ON cms_button_actions;
CREATE POLICY "admin_insert_cms_button_actions"
  ON cms_button_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_button_actions" ON cms_button_actions;
CREATE POLICY "admin_update_cms_button_actions"
  ON cms_button_actions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_button_actions" ON cms_button_actions;
CREATE POLICY "admin_delete_cms_button_actions"
  ON cms_button_actions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- updated_at trigger function (shared)
-- ============================================================
CREATE OR REPLACE FUNCTION cms_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cms_pages_updated_at ON cms_pages;
CREATE TRIGGER cms_pages_updated_at BEFORE UPDATE ON cms_pages
  FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();

DROP TRIGGER IF EXISTS cms_blocks_updated_at ON cms_blocks;
CREATE TRIGGER cms_blocks_updated_at BEFORE UPDATE ON cms_blocks
  FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();

DROP TRIGGER IF EXISTS cms_media_updated_at ON cms_media;
CREATE TRIGGER cms_media_updated_at BEFORE UPDATE ON cms_media
  FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();

-- ============================================================
-- Storage bucket for CMS media
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cms-media', 'cms-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for cms-media bucket
DROP POLICY IF EXISTS "public_read_cms_media_storage" ON storage.objects;
CREATE POLICY "public_read_cms_media_storage"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'cms-media');

DROP POLICY IF EXISTS "admin_upload_cms_media_storage" ON storage.objects;
CREATE POLICY "admin_upload_cms_media_storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_update_cms_media_storage" ON storage.objects;
CREATE POLICY "admin_update_cms_media_storage"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "admin_delete_cms_media_storage" ON storage.objects;
CREATE POLICY "admin_delete_cms_media_storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );
