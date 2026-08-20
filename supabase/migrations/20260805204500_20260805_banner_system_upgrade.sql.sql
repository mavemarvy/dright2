/*
# Marketplace Banner System — Dynamic Banners, Analytics, Links, Scheduling, Targeting, Sponsored

## Summary
Upgrades the existing `promotional_banners` table with full content, scheduling, audience targeting,
sponsored banner fields, soft-delete, and audit columns. Creates two new tables:
- `banner_analytics` — tracks impressions, clicks, and conversions per banner
- `banner_links` — connects banners to internal DRIGHT pages or external URLs

## Changes to `promotional_banners` (ALTER, no data loss)
New columns added:
- `description` (text, nullable) — longer promotional text
- `badge_text` (text, nullable) — small badge label e.g. "Limited Time"
- `promotional_message` (text, nullable) — additional promo text
- `desktop_image` (text, nullable) — desktop banner image URL
- `tablet_image` (text, nullable) — tablet banner image URL
- `mobile_image` (text, nullable) — mobile banner image URL
- `background_image` (text, nullable) — background layer image
- `video_url` (text, nullable) — optional video banner URL
- `button_text` (text, nullable) — CTA button label
- `button_style` (text, default 'primary') — button visual style
- `button_visible` (boolean, default true) — show/hide button
- `button_link` (text, nullable) — CTA destination URL (replaces cta_link usage)
- `banner_type` (text, default 'platform') — platform | seller_sponsored | affiliate_campaign | partner_ad
- `target_audience` (text[], default '{all}') — all | buyers | sellers | affiliates | vendors | new_users | verified_users
- `priority` (integer, default 0) — higher = more prominent
- `status` (text, default 'active') — active | disabled | archived
- `updated_by` (uuid, nullable, FK auth.users) — last admin to modify
- `updated_at` (timestamptz, default now()) — auto-updated
- `is_deleted` (boolean, default false) — soft delete
- `deleted_at` (timestamptz, nullable) — when soft-deleted
- Sponsored fields: `advertiser_name`, `campaign_id`, `payment_status`, `campaign_duration`, `budget`, `performance_data` (jsonb)

## New Tables

### 1. banner_analytics
- id (uuid PK)
- banner_id (uuid, FK promotional_banners, NOT NULL)
- user_id (uuid, FK auth.users, nullable — null for anonymous)
- event_type (text: 'impression' | 'click' | 'conversion')
- device_type (text: 'mobile' | 'tablet' | 'desktop')
- timestamp (timestamptz, default now())

### 2. banner_links
- id (uuid PK)
- banner_id (uuid, FK promotional_banners, NOT NULL)
- destination_type (text: 'product' | 'service' | 'job' | 'course' | 'category' | 'store' | 'tutorials' | 'announcements' | 'challenges' | 'referral' | 'affiliate' | 'vendor' | 'help' | 'external')
- destination_id (text, nullable — internal entity ID or slug)
- external_url (text, nullable — for external links)
- created_at (timestamptz)

## Security
- `promotional_banners`: public SELECT for active+non-deleted; admin-only INSERT/UPDATE/DELETE (unchanged, but USING now also checks `is_deleted = false`)
- `banner_analytics`: anon+authenticated can INSERT (tracking); admin-only SELECT
- `banner_links`: public SELECT (needed to resolve banner destinations); admin-only INSERT/UPDATE/DELETE
- All admin checks verify `users.is_admin = true AND users.admin_status = 'active'`

## Notes
1. Existing `media_url`, `cta_label`, `cta_link` columns are preserved for backward compatibility.
2. The `status` column coexists with `is_active` — `is_active` is kept for the old query path; new code should use `status`.
3. `updated_at` auto-updates via trigger.
4. Soft delete: `is_deleted = true` hides banners from all public queries.
5. All policies are idempotent (DROP IF EXISTS before CREATE).
*/

-- ============================================================
-- PART 1: Extend promotional_banners table
-- ============================================================

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS description text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS badge_text text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS promotional_message text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS desktop_image text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS tablet_image text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS mobile_image text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS background_image text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS video_url text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS button_text text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS button_style text NOT NULL DEFAULT 'primary' CHECK (button_style IN ('primary', 'secondary', 'ghost', 'gradient'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS button_visible boolean NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS button_link text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS banner_type text NOT NULL DEFAULT 'platform' CHECK (banner_type IN ('platform', 'seller_sponsored', 'affiliate_campaign', 'partner_ad'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS target_audience text[] NOT NULL DEFAULT '{all}' CHECK (target_audience <@ ARRAY['all','buyers','sellers','affiliates','vendors','new_users','verified_users']::text[]);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'archived'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Sponsored banner fields
DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS advertiser_name text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS campaign_id text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS campaign_duration text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS budget numeric(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE promotional_banners ADD COLUMN IF NOT EXISTS performance_data jsonb DEFAULT '{}'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_banner_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS promotional_banners_updated_at ON promotional_banners;
CREATE TRIGGER promotional_banners_updated_at
  BEFORE UPDATE ON promotional_banners
  FOR EACH ROW EXECUTE FUNCTION update_banner_updated_at();

-- Indexes for banner queries
CREATE INDEX IF NOT EXISTS promotional_banners_status_active_idx
  ON promotional_banners (status, priority DESC, display_order)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS promotional_banners_type_idx
  ON promotional_banners (banner_type)
  WHERE is_deleted = false;

-- ============================================================
-- PART 2: banner_analytics table
-- ============================================================

CREATE TABLE IF NOT EXISTS banner_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES promotional_banners(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'conversion')),
  device_type text NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('mobile', 'tablet', 'desktop')),
  timestamp timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE banner_analytics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (tracking)
DROP POLICY IF EXISTS "insert_banner_analytics" ON banner_analytics;
CREATE POLICY "insert_banner_analytics" ON banner_analytics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Only admins can read analytics
DROP POLICY IF EXISTS "select_banner_analytics_admin" ON banner_analytics;
CREATE POLICY "select_banner_analytics_admin" ON banner_analytics FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

DROP POLICY IF EXISTS "delete_banner_analytics_admin" ON banner_analytics;
CREATE POLICY "delete_banner_analytics_admin" ON banner_analytics FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

CREATE INDEX IF NOT EXISTS banner_analytics_banner_idx ON banner_analytics (banner_id, event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS banner_analytics_timestamp_idx ON banner_analytics (timestamp DESC);

-- ============================================================
-- PART 3: banner_links table
-- ============================================================

CREATE TABLE IF NOT EXISTS banner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES promotional_banners(id) ON DELETE CASCADE,
  destination_type text NOT NULL CHECK (destination_type IN (
    'product', 'service', 'job', 'course', 'category', 'store',
    'tutorials', 'announcements', 'challenges', 'referral', 'affiliate', 'vendor', 'help', 'external'
  )),
  destination_id text,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE banner_links ENABLE ROW LEVEL SECURITY;

-- Public can read links (needed to resolve banner destinations)
DROP POLICY IF EXISTS "select_banner_links_public" ON banner_links;
CREATE POLICY "select_banner_links_public" ON banner_links FOR SELECT
  TO anon, authenticated USING (true);

-- Admin-only management
DROP POLICY IF EXISTS "insert_banner_links_admin" ON banner_links;
CREATE POLICY "insert_banner_links_admin" ON banner_links FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

DROP POLICY IF EXISTS "update_banner_links_admin" ON banner_links;
CREATE POLICY "update_banner_links_admin" ON banner_links FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

DROP POLICY IF EXISTS "delete_banner_links_admin" ON banner_links;
CREATE POLICY "delete_banner_links_admin" ON banner_links FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

CREATE INDEX IF NOT EXISTS banner_links_banner_idx ON banner_links (banner_id);

-- ============================================================
-- PART 4: Update promotional_banners RLS policies
-- ============================================================

-- Replace SELECT policy to also exclude soft-deleted
DROP POLICY IF EXISTS "select_banners_public" ON promotional_banners;
CREATE POLICY "select_banners_public" ON promotional_banners FOR SELECT
  TO anon, authenticated USING (is_active = true AND is_deleted = false);

-- Update INSERT policy (already checks admin, but ensure it still works)
DROP POLICY IF EXISTS "insert_banners_admin" ON promotional_banners;
CREATE POLICY "insert_banners_admin" ON promotional_banners FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

-- Update UPDATE policy
DROP POLICY IF EXISTS "update_banners_admin" ON promotional_banners;
CREATE POLICY "update_banners_admin" ON promotional_banners FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

-- Update DELETE policy (now does soft-delete via UPDATE, but keep hard DELETE for admins)
DROP POLICY IF EXISTS "delete_banners_admin" ON promotional_banners;
CREATE POLICY "delete_banners_admin" ON promotional_banners FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

-- ============================================================
-- PART 5: Seed a sample banner
-- ============================================================

INSERT INTO promotional_banners (
  title, subtitle, description, badge_text, promotional_message,
  desktop_image, media_url, media_type,
  button_text, button_link, button_style, button_visible,
  banner_type, target_audience, status, is_active, priority, display_order
) VALUES (
  'Welcome to DRIGHT Marketplace',
  'Discover digital products, courses, services, and jobs from creators worldwide.',
  'Shop from thousands of digital products, online courses, professional services, and job opportunities. Join the DRIGHT community today.',
  'New',
  'Join thousands of buyers and sellers on DRIGHT',
  NULL, NULL, 'image',
  'Start Shopping', '/market', 'primary', true,
  'platform', ARRAY['all'], 'active', true, 0, 0
) ON CONFLICT DO NOTHING;
