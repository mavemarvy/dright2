/*
# DRIGHT Phase 5 — Admin Intelligence Dashboard & Marketplace Management

## New Tables
1. admin_activity_logs — Audit trail of all admin actions
2. moderation_queue — Unified moderation queue for listings/reviews/profiles
3. fraud_cases — Fraud investigation cases with risk scores
4. marketplace_stats_snapshot — Cached daily marketplace KPIs
5. financial_reports — Generated financial report records

## New RPCs
1. increment_product_sales — Atomically increment product sales counter
2. get_executive_kpis — Real-time executive dashboard metrics
3. get_marketplace_analytics — Marketplace listing/category analytics
4. get_seller_intelligence — Per-seller intelligence data
5. get_financial_summary — Financial dashboard summary
*/

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Increment product sales counter (atomic)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_product_sales(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET total_sales = COALESCE(total_sales, 0) + 1,
      stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - 1),
      updated_at = now()
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_product_sales(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ADMIN ACTIVITY LOGS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_activity_logs" ON admin_activity_logs;
CREATE POLICY "admin_select_activity_logs"
  ON admin_activity_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_activity_logs" ON admin_activity_logs;
CREATE POLICY "admin_insert_activity_logs"
  ON admin_activity_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_activity_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_activity_logs(target_type, target_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. MODERATION QUEUE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  -- listing | review | seller_profile | user_report | comment
  item_id uuid NOT NULL,
  reason text,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | hidden | restored | archived | flagged
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_moderation" ON moderation_queue;
CREATE POLICY "admin_select_moderation"
  ON moderation_queue FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_moderation" ON moderation_queue;
CREATE POLICY "admin_insert_moderation"
  ON moderation_queue FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_moderation" ON moderation_queue;
CREATE POLICY "admin_update_moderation"
  ON moderation_queue FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_item ON moderation_queue(item_type, item_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. FRAUD CASES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type text NOT NULL,
  -- click_fraud | review_fraud | referral_fraud | promotion_abuse | coupon_abuse | duplicate_account | suspicious_login | unusual_purchase
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  listing_id uuid,
  risk_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  -- open | investigating | resolved | dismissed | escalated
  details jsonb,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fraud_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_fraud" ON fraud_cases;
CREATE POLICY "admin_select_fraud"
  ON fraud_cases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_fraud" ON fraud_cases;
CREATE POLICY "admin_insert_fraud"
  ON fraud_cases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_fraud" ON fraud_cases;
CREATE POLICY "admin_update_fraud"
  ON fraud_cases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_fraud_status ON fraud_cases(status, risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_type ON fraud_cases(case_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_user ON fraud_cases(user_id) WHERE status = 'open';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. MARKETPLACE STATS SNAPSHOT (cached daily KPIs)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketplace_stats_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  total_sellers integer NOT NULL DEFAULT 0,
  total_buyers integer NOT NULL DEFAULT 0,
  total_listings integer NOT NULL DEFAULT 0,
  active_listings integer NOT NULL DEFAULT 0,
  pending_listings integer NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  promotion_revenue numeric NOT NULL DEFAULT 0,
  referral_revenue numeric NOT NULL DEFAULT 0,
  total_wishlist_items integer NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  avg_rating numeric NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  page_views integer NOT NULL DEFAULT 0,
  searches integer NOT NULL DEFAULT 0,
  UNIQUE(snapshot_date)
);

ALTER TABLE marketplace_stats_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_snapshots" ON marketplace_stats_snapshot;
CREATE POLICY "admin_select_snapshots"
  ON marketplace_stats_snapshot FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_snapshots" ON marketplace_stats_snapshot;
CREATE POLICY "admin_insert_snapshots"
  ON marketplace_stats_snapshot FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON marketplace_stats_snapshot(snapshot_date DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. FINANCIAL REPORTS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS financial_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  -- revenue | payouts | withdrawals | refunds | chargebacks | summary
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 0,
  metadata jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_financial_reports" ON financial_reports;
CREATE POLICY "admin_select_financial_reports"
  ON financial_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_financial_reports" ON financial_reports;
CREATE POLICY "admin_insert_financial_reports"
  ON financial_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_financial_reports_type ON financial_reports(report_type, period_start DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Get executive KPIs (real-time)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_executive_kpis()
RETURNS TABLE(
  total_users bigint, active_users_today bigint, new_users_today bigint,
  total_sellers bigint, total_buyers bigint, total_listings bigint,
  active_listings bigint, pending_listings bigint, total_orders bigint,
  total_revenue numeric, promotion_revenue numeric, referral_revenue numeric,
  pending_withdrawals bigint, completed_withdrawals bigint, pending_verifications bigint,
  total_wishlist bigint, total_reviews bigint, avg_rating numeric,
  total_page_views bigint, total_searches bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM users),
    (SELECT COUNT(*) FROM users WHERE last_seen_at > now() - interval '24 hours'),
    (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '24 hours'),
    (SELECT COUNT(*) FROM users WHERE is_seller = true OR uploaded_products_count > 0),
    (SELECT COUNT(*) FROM users WHERE is_seller = false OR uploaded_products_count = 0),
    (SELECT COUNT(*) FROM products),
    (SELECT COUNT(*) FROM products WHERE approval_status = 'approved' AND is_active = true AND is_hidden = false),
    (SELECT COUNT(*) FROM products WHERE approval_status = 'pending'),
    (SELECT COUNT(*) FROM guest_orders),
    COALESCE((SELECT SUM(total_amount) FROM guest_orders), 0),
    COALESCE((SELECT SUM(budget) FROM promotion_campaigns WHERE payment_status = 'paid'), 0),
    COALESCE((SELECT SUM(commission_amount) FROM sales_records WHERE status = 'completed'), 0),
    (SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'),
    (SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'completed'),
    (SELECT COUNT(*) FROM verifications WHERE status = 'pending'),
    (SELECT COUNT(*) FROM wishlist),
    (SELECT COUNT(*) FROM reviews),
    COALESCE((SELECT AVG(rating) FROM reviews), 0),
    (SELECT COUNT(*) FROM listing_events WHERE event_type = 'view'),
    (SELECT COUNT(*) FROM search_history);
END;
$$;

GRANT EXECUTE ON FUNCTION get_executive_kpis() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Get marketplace analytics
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_marketplace_analytics()
RETURNS TABLE(
  total_listings bigint, active_listings bigint, hidden_listings bigint,
  pending_listings bigint, total_sales bigint, total_revenue numeric,
  total_views bigint, total_wishlist bigint, conversion_rate numeric,
  top_category text, top_category_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM products),
    (SELECT COUNT(*) FROM products WHERE is_active = true AND is_hidden = false AND approval_status = 'approved'),
    (SELECT COUNT(*) FROM products WHERE is_hidden = true),
    (SELECT COUNT(*) FROM products WHERE approval_status = 'pending'),
    COALESCE((SELECT SUM(total_sales) FROM products), 0),
    COALESCE((SELECT SUM(sale_amount) FROM sales_records WHERE status = 'completed'), 0),
    COALESCE((SELECT SUM(view_count) FROM products), 0),
    (SELECT COUNT(*) FROM wishlist),
    CASE
      WHEN (SELECT COUNT(*) FROM listing_events) > 0
      THEN (SELECT COUNT(*)::numeric FROM listing_events WHERE event_type = 'purchase') / (SELECT COUNT(*)::numeric FROM listing_events WHERE event_type = 'view') * 100
      ELSE 0
    END,
    COALESCE((SELECT category FROM products WHERE approval_status = 'approved' GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1), ''),
    COALESCE((SELECT COUNT(*) FROM products WHERE approval_status = 'approved' GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_marketplace_analytics() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Get financial summary
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_financial_summary()
RETURNS TABLE(
  marketplace_revenue numeric, promotion_revenue numeric, referral_payouts numeric,
  seller_payouts numeric, pending_withdrawals numeric, completed_withdrawals numeric,
  total_refunds numeric, total_coupons_discount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM guest_orders), 0),
    COALESCE((SELECT SUM(budget) FROM promotion_campaigns WHERE payment_status = 'paid'), 0),
    COALESCE((SELECT SUM(commission_amount) FROM sales_records WHERE status = 'completed'), 0),
    COALESCE((SELECT SUM(amount) FROM payout_records WHERE status = 'completed'), 0),
    COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE status = 'pending'), 0),
    COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE status = 'completed'), 0),
    0::numeric,
    COALESCE((SELECT SUM(discount_amount) FROM coupon_redemptions), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_financial_summary() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Log admin activity
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_admin_activity(p_action text, p_target_type text, p_target_id text, p_details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION log_admin_activity(text, text, text, jsonb) TO authenticated;
