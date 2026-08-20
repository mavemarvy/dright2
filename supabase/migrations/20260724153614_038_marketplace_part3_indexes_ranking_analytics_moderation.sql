-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_uploaded_by ON products (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (is_active, is_hidden, approval_status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_sponsored ON products (is_sponsored) WHERE is_sponsored = true;
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_average_rating ON products (average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_products_total_sales ON products (total_sales DESC);
CREATE INDEX IF NOT EXISTS idx_products_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_view_count ON products (view_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON products (product_type);
CREATE INDEX IF NOT EXISTS idx_product_qa_product ON product_qa (product_id);
CREATE INDEX IF NOT EXISTS idx_product_qa_answered ON product_qa (answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_views_product ON product_views (product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_viewed ON product_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed (user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_followers_store ON store_followers (store_id);
CREATE INDEX IF NOT EXISTS idx_store_followers_follower ON store_followers (follower_id);

-- Moderation reports table
CREATE TABLE IF NOT EXISTS moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('product','review','qa','seller','store')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  report_category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  admin_notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE moderation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_reports_admin" ON moderation_reports FOR SELECT TO authenticated USING (
  auth.uid() = reporter_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "insert_reports_auth" ON moderation_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "update_reports_admin" ON moderation_reports FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON moderation_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_target ON moderation_reports (target_type, target_id);

-- Product analytics daily summary
CREATE TABLE IF NOT EXISTS product_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  views integer NOT NULL DEFAULT 0,
  unique_viewers integer NOT NULL DEFAULT 0,
  wishlist_adds integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  search_impressions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, date)
);
ALTER TABLE product_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_analytics_owner_admin" ON product_analytics FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM products WHERE id = product_id AND uploaded_by = auth.uid())
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "insert_analytics_any" ON product_analytics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_analytics_any" ON product_analytics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_product_analytics_product_date ON product_analytics (product_id, date DESC);

-- Marketplace ranking weights
CREATE TABLE IF NOT EXISTS marketplace_ranking_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  relevance_weight numeric(4,2) NOT NULL DEFAULT 30.0,
  seller_verification_weight numeric(4,2) NOT NULL DEFAULT 15.0,
  listing_quality_weight numeric(4,2) NOT NULL DEFAULT 10.0,
  conversion_rate_weight numeric(4,2) NOT NULL DEFAULT 15.0,
  sales_history_weight numeric(4,2) NOT NULL DEFAULT 10.0,
  rating_weight numeric(4,2) NOT NULL DEFAULT 10.0,
  freshness_weight numeric(4,2) NOT NULL DEFAULT 5.0,
  trending_weight numeric(4,2) NOT NULL DEFAULT 5.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_ranking_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_weights_any" ON marketplace_ranking_weights FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "update_weights_admin" ON marketplace_ranking_weights FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
INSERT INTO marketplace_ranking_weights (is_singleton)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM marketplace_ranking_weights);

-- Featured/sponsored products management
CREATE TABLE IF NOT EXISTS featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  promotion_type text NOT NULL CHECK (promotion_type IN ('featured','sponsored','homepage_banner','category_spotlight','flash_deal','recommended','trending')),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE featured_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_featured_any" ON featured_products FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "insert_featured_admin" ON featured_products FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "update_featured_admin" ON featured_products FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "delete_featured_admin" ON featured_products FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE INDEX IF NOT EXISTS idx_featured_products_active ON featured_products (promotion_type, is_active, end_date DESC);

-- Marketplace collections
CREATE TABLE IF NOT EXISTS marketplace_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  icon text NOT NULL DEFAULT 'Package',
  color text NOT NULL DEFAULT 'bg-primary-500',
  collection_type text NOT NULL CHECK (collection_type IN ('trending','best_sellers','recently_added','most_viewed','highest_rated','editors_choice','staff_picks','student_picks','business_essentials','ai_tools','digital_products','limited_deals','flash_sales','premium_sellers','custom')),
  sort_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_auto_generated boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_collections_any" ON marketplace_collections FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "insert_collections_admin" ON marketplace_collections FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "update_collections_admin" ON marketplace_collections FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "delete_collections_admin" ON marketplace_collections FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE INDEX IF NOT EXISTS idx_collections_active ON marketplace_collections (is_active, display_order ASC);

-- Audit logs for moderation actions
CREATE TABLE IF NOT EXISTS moderation_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE moderation_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_audit_admin" ON moderation_audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "insert_audit_admin" ON moderation_audit_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON moderation_audit_logs (created_at DESC);
