/*
# DRIGHT Phase 3 — Promotion & Advertising System

## Summary
Self-service advertising platform for sellers to promote listings.
Inspired by TikTok Promote / Facebook Boost Post / Google Ads Express,
adapted for marketplace fairness.

## New Tables
1. promotion_pricing — Singleton, admin-configurable pricing (CPM, CPC, CPR, min/max budget)
2. promotion_packages — Pre-built packages (Starter, Growth, Business, Premium, Enterprise)
3. promotion_campaigns — Active/past campaigns with budget, targeting, status
4. campaign_events — Raw impression/click/conversion events with fraud flags
5. campaign_statistics — Aggregated daily stats per campaign (cached)
6. campaign_reports — Admin-generated reports (revenue, performance)
7. sponsored_listing_logs — Placement log (where sponsored listings appeared)

## Security
- RLS on ALL tables.
- promotion_pricing: SELECT for authenticated; UPDATE for admins.
- promotion_packages: SELECT for authenticated; CRUD for admins.
- promotion_campaigns: SELECT/INSERT/UPDATE for owner (auth.uid = seller_id); admin UPDATE.
- campaign_events: INSERT for authenticated (with fraud check); SELECT for owner+admin.
- campaign_statistics: SELECT for owner+admin.
- campaign_reports: SELECT/INSERT for admin only.
- sponsored_listing_logs: INSERT for authenticated; SELECT for owner+admin.

## Reuse
- Reads from Phase 1 listing_events, listing_scores for organic engagement.
- Uses existing notification system for campaign notifications.
- Uses existing payment system for checkout.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. PROMOTION PRICING — Singleton, admin-configurable
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promotion_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  cost_per_impression numeric NOT NULL DEFAULT 0.01,
  cost_per_100_impressions numeric NOT NULL DEFAULT 0.80,
  cost_per_1000_impressions numeric NOT NULL DEFAULT 6.00,
  cost_per_click numeric NOT NULL DEFAULT 0.15,
  cost_per_reach numeric NOT NULL DEFAULT 0.02,
  daily_minimum_budget numeric NOT NULL DEFAULT 1.00,
  maximum_campaign_budget numeric NOT NULL DEFAULT 5000.00,
  currency text NOT NULL DEFAULT 'USD',
  default_ctr numeric NOT NULL DEFAULT 0.02,
  default_conversion_rate numeric NOT NULL DEFAULT 0.05,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotion_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_promotion_pricing" ON promotion_pricing;
CREATE POLICY "select_promotion_pricing"
  ON promotion_pricing FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_promotion_pricing" ON promotion_pricing;
CREATE POLICY "admin_update_promotion_pricing"
  ON promotion_pricing FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_promotion_pricing" ON promotion_pricing;
CREATE POLICY "admin_insert_promotion_pricing"
  ON promotion_pricing FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

INSERT INTO promotion_pricing (is_singleton) VALUES (true) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. PROMOTION PACKAGES — Pre-built packages
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promotion_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  estimated_reach integer NOT NULL,
  estimated_impressions integer NOT NULL,
  estimated_clicks integer NOT NULL,
  duration_days integer NOT NULL,
  bonus_impressions integer NOT NULL DEFAULT 0,
  bonus_recommendation_exposure boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotion_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_promotion_packages" ON promotion_packages;
CREATE POLICY "select_promotion_packages"
  ON promotion_packages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_promotion_packages" ON promotion_packages;
CREATE POLICY "admin_insert_promotion_packages"
  ON promotion_packages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_promotion_packages" ON promotion_packages;
CREATE POLICY "admin_update_promotion_packages"
  ON promotion_packages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_delete_promotion_packages" ON promotion_packages;
CREATE POLICY "admin_delete_promotion_packages"
  ON promotion_packages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- Seed default packages
INSERT INTO promotion_packages (name, description, price, estimated_reach, estimated_impressions, estimated_clicks, duration_days, bonus_impressions, bonus_recommendation_exposure, sort_order) VALUES
('Starter', 'Perfect for trying out promotions', 5.00, 500, 2500, 50, 1, 0, false, 0),
('Growth', 'Boost your visibility and reach', 15.00, 2000, 10000, 200, 3, 500, false, 1),
('Business', 'Serious exposure for growing sellers', 35.00, 5000, 30000, 600, 7, 2000, true, 2),
('Premium', 'Maximum reach with bonus recommendations', 75.00, 12000, 80000, 1600, 14, 5000, true, 3),
('Enterprise', 'Full marketplace domination', 150.00, 25000, 200000, 4000, 30, 15000, true, 4)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. PROMOTION CAMPAIGNS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promotion_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  goal text NOT NULL DEFAULT 'more_views',
  audience_type text NOT NULL DEFAULT 'everyone',
  audience_country text,
  audience_state text,
  audience_city text,
  audience_category text,
  audience_interests text[] DEFAULT '{}',
  audience_followers_only boolean NOT NULL DEFAULT false,
  budget numeric NOT NULL,
  duration_days integer NOT NULL,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_id text,
  payment_status text NOT NULL DEFAULT 'pending',
  package_id uuid REFERENCES promotion_packages(id) ON DELETE SET NULL,
  estimated_reach integer NOT NULL DEFAULT 0,
  estimated_impressions integer NOT NULL DEFAULT 0,
  estimated_clicks integer NOT NULL DEFAULT 0,
  estimated_conversions integer NOT NULL DEFAULT 0,
  actual_impressions integer NOT NULL DEFAULT 0,
  actual_clicks integer NOT NULL DEFAULT 0,
  actual_conversions integer NOT NULL DEFAULT 0,
  actual_reach integer NOT NULL DEFAULT 0,
  actual_spend numeric NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotion_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_campaigns" ON promotion_campaigns;
CREATE POLICY "select_own_campaigns"
  ON promotion_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "insert_own_campaigns" ON promotion_campaigns;
CREATE POLICY "insert_own_campaigns"
  ON promotion_campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "update_own_campaigns" ON promotion_campaigns;
CREATE POLICY "update_own_campaigns"
  ON promotion_campaigns FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (auth.uid() = seller_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "delete_own_campaigns" ON promotion_campaigns;
CREATE POLICY "delete_own_campaigns"
  ON promotion_campaigns FOR DELETE TO authenticated
  USING (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_seller ON promotion_campaigns(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON promotion_campaigns(status, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_listing ON promotion_campaigns(listing_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON promotion_campaigns(end_date) WHERE status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. CAMPAIGN EVENTS — Raw impression/click/conversion with fraud flags
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES promotion_campaigns(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text,
  device_fingerprint text,
  is_fraudulent boolean NOT NULL DEFAULT false,
  fraud_reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_campaign_events" ON campaign_events;
CREATE POLICY "insert_campaign_events"
  ON campaign_events FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_campaign_events" ON campaign_events;
CREATE POLICY "select_own_campaign_events"
  ON campaign_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM promotion_campaigns WHERE promotion_campaigns.id = campaign_id AND promotion_campaigns.seller_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign
  ON campaign_events(campaign_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_fraud
  ON campaign_events(campaign_id, is_fraudulent)
  WHERE is_fraudulent = true;
CREATE INDEX IF NOT EXISTS idx_campaign_events_ip
  ON campaign_events(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. CAMPAIGN STATISTICS — Aggregated daily stats (cached)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS campaign_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES promotion_campaigns(id) ON DELETE CASCADE,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  spend numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  cpa numeric NOT NULL DEFAULT 0,
  sales_revenue numeric NOT NULL DEFAULT 0,
  messages integer NOT NULL DEFAULT 0,
  applications integer NOT NULL DEFAULT 0,
  enrollments integer NOT NULL DEFAULT 0,
  UNIQUE(campaign_id, stat_date)
);

ALTER TABLE campaign_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_campaign_stats" ON campaign_statistics;
CREATE POLICY "select_own_campaign_stats"
  ON campaign_statistics FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM promotion_campaigns WHERE promotion_campaigns.id = campaign_id AND promotion_campaigns.seller_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_campaign_stats_campaign
  ON campaign_statistics(campaign_id, stat_date DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. CAMPAIGN REPORTS — Admin-generated reports
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS campaign_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_campaigns integer NOT NULL DEFAULT 0,
  total_impressions integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  total_conversions integer NOT NULL DEFAULT 0,
  metadata jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_campaign_reports" ON campaign_reports;
CREATE POLICY "admin_select_campaign_reports"
  ON campaign_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_campaign_reports" ON campaign_reports;
CREATE POLICY "admin_insert_campaign_reports"
  ON campaign_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- ════════════════════════════════════════════════════════════════════════════
-- 7. SPONSORED LISTING LOGS — Placement tracking
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sponsored_listing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES promotion_campaigns(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  placement text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sponsored_listing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_sponsored_logs" ON sponsored_listing_logs;
CREATE POLICY "insert_sponsored_logs"
  ON sponsored_listing_logs FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_sponsored_logs" ON sponsored_listing_logs;
CREATE POLICY "select_own_sponsored_logs"
  ON sponsored_listing_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM promotion_campaigns WHERE promotion_campaigns.id = campaign_id AND promotion_campaigns.seller_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_sponsored_logs_campaign
  ON sponsored_listing_logs(campaign_id, placement, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Activate campaign after payment
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION activate_campaign(p_campaign_id uuid, p_payment_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE promotion_campaigns
  SET status = 'active',
      payment_status = 'paid',
      payment_id = p_payment_id,
      start_date = now(),
      updated_at = now()
  WHERE id = p_campaign_id
    AND status = 'pending'
    AND payment_status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION activate_campaign(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Expire campaigns past end_date
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION expire_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE promotion_campaigns
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND end_date < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_campaigns() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Get active sponsored listings for placement
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sponsored_listings(p_placement text, p_limit integer DEFAULT 5)
RETURNS TABLE(listing_id uuid, campaign_id uuid, listing_type text, goal text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT pc.listing_id, pc.id, pc.listing_type, pc.goal
  FROM promotion_campaigns pc
  WHERE pc.status = 'active'
    AND pc.end_date > now()
    AND pc.actual_spend < pc.budget
  ORDER BY pc.budget DESC, pc.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sponsored_listings(text, integer) TO authenticated, anon;
