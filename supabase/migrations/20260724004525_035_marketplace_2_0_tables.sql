/*
# Marketplace 2.0: Wishlist, Recently Viewed, Store Followers, Promotional Banners, Product Views

## Summary
Adds 5 new tables to support the upgraded marketplace experience:
- wishlist: users save products they want to buy later, with price-drop and stock alerts
- recently_viewed: tracks products each user has browsed for "continue browsing" and recommendations
- store_followers: follow/unfollow stores with notification preferences
- promotional_banners: admin-managed hero banners (images, video, countdown, CTA)
- product_views: analytics — view counts per product for "most viewed" sorting and popularity

## New Tables

### 1. wishlist
- id (uuid PK)
- user_id (uuid, FK auth.users, NOT NULL DEFAULT auth.uid())
- product_id (uuid, FK products, NOT NULL)
- folder (text, nullable — lets users organize wishlist into folders/collections)
- notify_price_drop (boolean, default true — alerts when price decreases)
- notify_back_in_stock (boolean, default true — alerts when restocked)
- created_at (timestamptz)

### 2. recently_viewed
- id (uuid PK)
- user_id (uuid, FK auth.users, NOT NULL DEFAULT auth.uid())
- product_id (uuid, FK products, NOT NULL)
- viewed_at (timestamptz, default now())
- view_count (integer, default 1 — increments on repeat views)

### 3. store_followers
- id (uuid PK)
- follower_id (uuid, FK auth.users — the user following)
- store_id (uuid, FK auth.users — the seller being followed)
- notify_new_products (boolean, default true)
- notify_price_drops (boolean, default true)
- notify_promotions (boolean, default true)
- notify_events (boolean, default false)
- created_at (timestamptz)

### 4. promotional_banners
- id (uuid PK)
- title (text)
- subtitle (text, nullable)
- media_url (text — image or video URL)
- media_type (text: 'image' or 'video')
- cta_label (text, nullable — button text)
- cta_link (text, nullable — destination URL)
- countdown_ends_at (timestamptz, nullable — for flash-sale countdowns)
- campaign_link (text, nullable — UTM-tracked campaign URL)
- is_active (boolean, default true)
- display_order (integer, default 0 — controls banner rotation order)
- starts_at (timestamptz, nullable)
- ends_at (timestamptz, nullable)
- created_at (timestamptz)
- created_by (uuid, FK auth.users, nullable)

### 5. product_views
- id (uuid PK)
- product_id (uuid, FK products, NOT NULL)
- user_id (uuid, FK auth.users, nullable — null for anonymous views)
- viewed_at (timestamptz, default now())

## Security (RLS)
- All tables have RLS enabled
- wishlist, recently_viewed: owner-scoped (auth.uid() = user_id), TO authenticated
- store_followers: followers can see who they follow; anyone can see follower counts
- promotional_banners: public read (anon + authenticated) since banners are shown to all visitors; only admins can create/update/delete
- product_views: anyone can insert (anonymous tracking), no reads needed via API
*/

-- 1. WISHLIST TABLE
CREATE TABLE IF NOT EXISTS wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  folder text,
  notify_price_drop boolean NOT NULL DEFAULT true,
  notify_back_in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wishlist" ON wishlist;
CREATE POLICY "select_own_wishlist" ON wishlist FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wishlist" ON wishlist;
CREATE POLICY "insert_own_wishlist" ON wishlist FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wishlist" ON wishlist;
CREATE POLICY "update_own_wishlist" ON wishlist FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wishlist" ON wishlist;
CREATE POLICY "delete_own_wishlist" ON wishlist FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS wishlist_user_product_idx ON wishlist (user_id, product_id);
CREATE INDEX IF NOT EXISTS wishlist_product_idx ON wishlist (product_id);

-- 2. RECENTLY_VIEWED TABLE
CREATE TABLE IF NOT EXISTS recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 1
);

ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recently_viewed" ON recently_viewed;
CREATE POLICY "select_own_recently_viewed" ON recently_viewed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recently_viewed" ON recently_viewed;
CREATE POLICY "insert_own_recently_viewed" ON recently_viewed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recently_viewed" ON recently_viewed;
CREATE POLICY "update_own_recently_viewed" ON recently_viewed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recently_viewed" ON recently_viewed;
CREATE POLICY "delete_own_recently_viewed" ON recently_viewed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS recently_viewed_user_idx ON recently_viewed (user_id, viewed_at DESC);

-- 3. STORE_FOLLOWERS TABLE
CREATE TABLE IF NOT EXISTS store_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_new_products boolean NOT NULL DEFAULT true,
  notify_price_drops boolean NOT NULL DEFAULT true,
  notify_promotions boolean NOT NULL DEFAULT true,
  notify_events boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_store_followers" ON store_followers;
CREATE POLICY "select_store_followers" ON store_followers FOR SELECT
  TO authenticated USING (auth.uid() = follower_id OR auth.uid() = store_id);

DROP POLICY IF EXISTS "insert_own_follow" ON store_followers;
CREATE POLICY "insert_own_follow" ON store_followers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "delete_own_follow" ON store_followers;
CREATE POLICY "delete_own_follow" ON store_followers FOR DELETE
  TO authenticated USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "update_own_follow" ON store_followers;
CREATE POLICY "update_own_follow" ON store_followers FOR UPDATE
  TO authenticated USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);

CREATE UNIQUE INDEX IF NOT EXISTS store_followers_unique_idx ON store_followers (follower_id, store_id);
CREATE INDEX IF NOT EXISTS store_followers_store_idx ON store_followers (store_id);

-- 4. PROMOTIONAL_BANNERS TABLE
CREATE TABLE IF NOT EXISTS promotional_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  media_url text,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  cta_label text,
  cta_link text,
  countdown_ends_at timestamptz,
  campaign_link text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE promotional_banners ENABLE ROW LEVEL SECURITY;

-- Banners are public — shown to all marketplace visitors including logged-out
DROP POLICY IF EXISTS "select_banners_public" ON promotional_banners;
CREATE POLICY "select_banners_public" ON promotional_banners FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- Only admins can manage banners
DROP POLICY IF EXISTS "insert_banners_admin" ON promotional_banners;
CREATE POLICY "insert_banners_admin" ON promotional_banners FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

DROP POLICY IF EXISTS "update_banners_admin" ON promotional_banners;
CREATE POLICY "update_banners_admin" ON promotional_banners FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

DROP POLICY IF EXISTS "delete_banners_admin" ON promotional_banners;
CREATE POLICY "delete_banners_admin" ON promotional_banners FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active')
  );

-- 5. PRODUCT_VIEWS TABLE
CREATE TABLE IF NOT EXISTS product_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can record a view — for analytics
DROP POLICY IF EXISTS "insert_product_views" ON product_views;
CREATE POLICY "insert_product_views" ON product_views FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- No SELECT needed via API — analytics are computed server-side
CREATE INDEX IF NOT EXISTS product_views_product_idx ON product_views (product_id);
CREATE INDEX IF NOT EXISTS product_views_count_idx ON product_views (product_id, viewed_at);
