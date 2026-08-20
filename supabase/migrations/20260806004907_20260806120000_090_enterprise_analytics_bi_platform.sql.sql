/*
# Enterprise Analytics, Business Intelligence & Operations Dashboard

## Overview
Creates the BI product layer tables for DRIGHT's Enterprise Analytics platform.
The data ingestion pipeline (analytics_events) and RPCs already exist from migrations 065-068.

## New Tables (6 new + 1 altered)
1. analytics_dashboards — Custom saved dashboards
2. analytics_reports — Scheduled and on-demand reports
3. ai_business_reports — AI-generated executive summaries
4. ai_recommendations — (existing table, adding missing columns)
5. analytics_exports — Track all data exports
6. analytics_sessions — Session tracking
7. analytics_kpis — Configurable KPI definitions

## Security
- All tables have RLS enabled
- Super admin has full CRUD access via is_platform_admin() helper
*/

-- Helper function
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.is_admin = true
  )
$$;

-- 1. analytics_dashboards
CREATE TABLE IF NOT EXISTS analytics_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  widget_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE analytics_dashboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_dashboards" ON analytics_dashboards;
CREATE POLICY "select_dashboards" ON analytics_dashboards FOR SELECT TO authenticated USING (is_platform_admin() OR owner_id = auth.uid() OR is_shared = true);
DROP POLICY IF EXISTS "insert_dashboards" ON analytics_dashboards;
CREATE POLICY "insert_dashboards" ON analytics_dashboards FOR INSERT TO authenticated WITH CHECK (is_platform_admin() OR auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "update_dashboards" ON analytics_dashboards;
CREATE POLICY "update_dashboards" ON analytics_dashboards FOR UPDATE TO authenticated USING (is_platform_admin() OR owner_id = auth.uid()) WITH CHECK (is_platform_admin() OR owner_id = auth.uid());
DROP POLICY IF EXISTS "delete_dashboards" ON analytics_dashboards;
CREATE POLICY "delete_dashboards" ON analytics_dashboards FOR DELETE TO authenticated USING (is_platform_admin() OR owner_id = auth.uid());

-- 2. analytics_reports
CREATE TABLE IF NOT EXISTS analytics_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'marketplace',
  format text NOT NULL DEFAULT 'csv',
  date_range jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_frequency text NOT NULL DEFAULT 'once',
  schedule_day_of_week integer,
  schedule_day_of_month integer,
  schedule_time text DEFAULT '09:00',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status text,
  email_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_subject text,
  email_body text,
  file_url text,
  file_size_bytes bigint,
  row_count integer,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE analytics_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_reports" ON analytics_reports;
CREATE POLICY "select_reports" ON analytics_reports FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_reports" ON analytics_reports;
CREATE POLICY "insert_reports" ON analytics_reports FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "update_reports" ON analytics_reports;
CREATE POLICY "update_reports" ON analytics_reports FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "delete_reports" ON analytics_reports;
CREATE POLICY "delete_reports" ON analytics_reports FOR DELETE TO authenticated USING (is_platform_admin());

-- 3. ai_business_reports
CREATE TABLE IF NOT EXISTS ai_business_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  detailed_analysis text,
  key_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  ai_provider text NOT NULL DEFAULT 'openai',
  ai_model text,
  prompt_used text,
  tokens_used integer,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE ai_business_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_ai_reports" ON ai_business_reports;
CREATE POLICY "select_ai_reports" ON ai_business_reports FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_ai_reports" ON ai_business_reports;
CREATE POLICY "insert_ai_reports" ON ai_business_reports FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "update_ai_reports" ON ai_business_reports;
CREATE POLICY "update_ai_reports" ON ai_business_reports FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "delete_ai_reports" ON ai_business_reports;
CREATE POLICY "delete_ai_reports" ON ai_business_reports FOR DELETE TO authenticated USING (is_platform_admin());

-- 4. ai_recommendations — add missing columns to existing table
DO $$
BEGIN
  -- Add status column (use is_acted_on/is_dismissed as fallback in app logic)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'status') THEN
    ALTER TABLE ai_recommendations ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'priority') THEN
    ALTER TABLE ai_recommendations ADD COLUMN priority text NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'category') THEN
    ALTER TABLE ai_recommendations ADD COLUMN category text NOT NULL DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'action_type') THEN
    ALTER TABLE ai_recommendations ADD COLUMN action_type text NOT NULL DEFAULT 'suggestion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'target_entity') THEN
    ALTER TABLE ai_recommendations ADD COLUMN target_entity text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'target_entity_id') THEN
    ALTER TABLE ai_recommendations ADD COLUMN target_entity_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'expected_impact') THEN
    ALTER TABLE ai_recommendations ADD COLUMN expected_impact text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'ai_provider') THEN
    ALTER TABLE ai_recommendations ADD COLUMN ai_provider text NOT NULL DEFAULT 'openai';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'ai_model') THEN
    ALTER TABLE ai_recommendations ADD COLUMN ai_model text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'metrics_context') THEN
    ALTER TABLE ai_recommendations ADD COLUMN metrics_context jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'acted_on_by') THEN
    ALTER TABLE ai_recommendations ADD COLUMN acted_on_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'acted_on_at') THEN
    ALTER TABLE ai_recommendations ADD COLUMN acted_on_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'action_notes') THEN
    ALTER TABLE ai_recommendations ADD COLUMN action_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'dismissed_by') THEN
    ALTER TABLE ai_recommendations ADD COLUMN dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'dismissed_at') THEN
    ALTER TABLE ai_recommendations ADD COLUMN dismissed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'updated_at') THEN
    ALTER TABLE ai_recommendations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_recommendations' AND column_name = 'deleted_at') THEN
    ALTER TABLE ai_recommendations ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_ai_recs" ON ai_recommendations;
CREATE POLICY "select_ai_recs" ON ai_recommendations FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_ai_recs" ON ai_recommendations;
CREATE POLICY "insert_ai_recs" ON ai_recommendations FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "update_ai_recs" ON ai_recommendations;
CREATE POLICY "update_ai_recs" ON ai_recommendations FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "delete_ai_recs" ON ai_recommendations;
CREATE POLICY "delete_ai_recs" ON ai_recommendations FOR DELETE TO authenticated USING (is_platform_admin());

-- 5. analytics_exports
CREATE TABLE IF NOT EXISTS analytics_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES analytics_reports(id) ON DELETE SET NULL,
  export_type text NOT NULL DEFAULT 'csv',
  data_category text NOT NULL,
  date_range_start timestamptz,
  date_range_end timestamptz,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_url text,
  file_size_bytes bigint,
  row_count integer,
  download_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE analytics_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_exports" ON analytics_exports;
CREATE POLICY "select_exports" ON analytics_exports FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_exports" ON analytics_exports;
CREATE POLICY "insert_exports" ON analytics_exports FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "update_exports" ON analytics_exports;
CREATE POLICY "update_exports" ON analytics_exports FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "delete_exports" ON analytics_exports;
CREATE POLICY "delete_exports" ON analytics_exports FOR DELETE TO authenticated USING (is_platform_admin());

-- 6. analytics_sessions
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_type text,
  os text,
  browser text,
  language text,
  timezone text,
  country text,
  ip_address inet,
  entry_page text,
  exit_page text,
  page_views integer NOT NULL DEFAULT 0,
  events_count integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  is_bounce boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_sessions" ON analytics_sessions;
CREATE POLICY "select_sessions" ON analytics_sessions FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_sessions" ON analytics_sessions;
CREATE POLICY "insert_sessions" ON analytics_sessions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_sessions" ON analytics_sessions;
CREATE POLICY "update_sessions" ON analytics_sessions FOR UPDATE TO authenticated USING (is_platform_admin());

-- 7. analytics_kpis
CREATE TABLE IF NOT EXISTS analytics_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL DEFAULT 'marketplace',
  metric_key text NOT NULL,
  unit text DEFAULT 'count',
  target_value numeric,
  warning_threshold numeric,
  critical_threshold numeric,
  comparison_operator text NOT NULL DEFAULT 'greater_than',
  icon text,
  color text DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE analytics_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_kpis" ON analytics_kpis;
CREATE POLICY "select_kpis" ON analytics_kpis FOR SELECT TO authenticated USING (is_platform_admin());
DROP POLICY IF EXISTS "insert_kpis" ON analytics_kpis;
CREATE POLICY "insert_kpis" ON analytics_kpis FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "update_kpis" ON analytics_kpis;
CREATE POLICY "update_kpis" ON analytics_kpis FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "delete_kpis" ON analytics_kpis;
CREATE POLICY "delete_kpis" ON analytics_kpis FOR DELETE TO authenticated USING (is_platform_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_owner ON analytics_dashboards(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_reports_schedule ON analytics_reports(next_run_at) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_business_reports_period ON ai_business_reports(period_start DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_recs_status ON ai_recommendations(status, priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_exports_created ON analytics_exports(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started ON analytics_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_kpis_category ON analytics_kpis(category, sort_order) WHERE deleted_at IS NULL AND is_visible = true;

-- Seed default KPIs
INSERT INTO analytics_kpis (name, display_name, category, metric_key, unit, target_value, warning_threshold, critical_threshold, comparison_operator, icon, color, sort_order)
VALUES
  ('total_users', 'Total Users', 'marketplace', 'total_users', 'count', 10000, 5000, 1000, 'greater_than', 'Users', '#6366f1', 1),
  ('active_users', 'Active Users', 'marketplace', 'active_users', 'count', 5000, 2000, 500, 'greater_than', 'UserCheck', '#10b981', 2),
  ('new_registrations', 'New Registrations', 'marketplace', 'new_registrations', 'count', 100, 50, 20, 'greater_than', 'UserPlus', '#8b5cf6', 3),
  ('verified_users', 'Verified Users', 'marketplace', 'verified_users', 'count', 3000, 1000, 200, 'greater_than', 'ShieldCheck', '#06b6d4', 4),
  ('total_sellers', 'Sellers', 'marketplace', 'total_sellers', 'count', 500, 200, 50, 'greater_than', 'Store', '#f59e0b', 5),
  ('total_affiliates', 'Affiliates', 'marketplace', 'total_affiliates', 'count', 200, 100, 20, 'greater_than', 'Share2', '#ec4899', 6),
  ('revenue_today', 'Today''s Revenue', 'revenue', 'revenue_today', 'currency', 50000, 20000, 5000, 'greater_than', 'DollarSign', '#10b981', 10),
  ('revenue_weekly', 'Weekly Revenue', 'revenue', 'revenue_weekly', 'currency', 200000, 100000, 20000, 'greater_than', 'TrendingUp', '#059669', 11),
  ('revenue_monthly', 'Monthly Revenue', 'revenue', 'revenue_monthly', 'currency', 500000, 200000, 50000, 'greater_than', 'BarChart3', '#047857', 12),
  ('pending_reviews', 'Pending Reviews', 'operations', 'pending_reviews', 'count', 0, 10, 25, 'less_than', 'Clock', '#f59e0b', 20),
  ('pending_withdrawals', 'Pending Withdrawals', 'operations', 'pending_withdrawals', 'count', 0, 5, 15, 'less_than', 'ArrowDownCircle', '#ef4444', 21),
  ('open_tickets', 'Open Tickets', 'operations', 'open_tickets', 'count', 0, 20, 50, 'less_than', 'LifeBuoy', '#f97316', 22),
  ('pending_kyc', 'Pending KYC', 'operations', 'pending_kyc', 'count', 0, 10, 30, 'less_than', 'FileCheck', '#8b5cf6', 23),
  ('total_products', 'Total Products', 'marketplace', 'total_products', 'count', 1000, 500, 100, 'greater_than', 'Package', '#3b82f6', 30),
  ('conversion_rate', 'Conversion Rate', 'marketplace', 'conversion_rate', 'percent', 3, 1, 0.5, 'greater_than', 'Target', '#ec4899', 40),
  ('avg_order_value', 'Avg Order Value', 'revenue', 'avg_order_value', 'currency', 5000, 2000, 500, 'greater_than', 'ShoppingCart', '#6366f1', 50)
ON CONFLICT DO NOTHING;

-- updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_analytics_dashboards_updated ON analytics_dashboards;
CREATE TRIGGER trigger_analytics_dashboards_updated BEFORE UPDATE ON analytics_dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trigger_analytics_reports_updated ON analytics_reports;
CREATE TRIGGER trigger_analytics_reports_updated BEFORE UPDATE ON analytics_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trigger_ai_business_reports_updated ON ai_business_reports;
CREATE TRIGGER trigger_ai_business_reports_updated BEFORE UPDATE ON ai_business_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trigger_ai_recs_updated ON ai_recommendations;
CREATE TRIGGER trigger_ai_recs_updated BEFORE UPDATE ON ai_recommendations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trigger_analytics_kpis_updated ON analytics_kpis;
CREATE TRIGGER trigger_analytics_kpis_updated BEFORE UPDATE ON analytics_kpis FOR EACH ROW EXECUTE FUNCTION update_updated_at();