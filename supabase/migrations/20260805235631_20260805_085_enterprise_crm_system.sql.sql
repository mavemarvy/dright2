/*
# Enterprise CRM, Customer Success, Sales, Marketing & Customer Care Platform

## Overview
This migration creates the complete database layer for the DRIGHT enterprise CRM system.
It adds 11 new tables covering customer relationship management, timelines, subscription
recovery, customer recovery queues, contact center, marketing campaigns, promotion
statistics, admin performance tracking, payout methods, and AI customer insights.

## New Tables

1. crm_customers — Aggregated customer profile view (links to users, stores CRM-specific metadata)
2. customer_timelines — Chronological activity log per user (registration, purchases, sales, etc.)
3. subscription_reminders — Scheduled reminders for subscription expirations (30/14/7/3/1 days before, 0/3/7/14 days after)
4. customer_recovery_queue — Users needing recovery outreach (expired subs, abandoned carts, incomplete onboarding, etc.)
5. customer_contacts — Contact center interaction records (channel, summary, follow-up, outcome)
6. customer_contact_logs — Detailed log entries for each contact interaction
7. marketing_campaigns — Marketing campaign tracking (sponsored products/services/jobs, coupons, promotions)
8. promotion_statistics — Performance metrics per promotion (impressions, clicks, CTR, reach, conversions, budget)
9. admin_performance — Per-admin performance metrics (tickets resolved, response time, satisfaction, etc.)
10. payout_methods — User payout methods (bank, PayPal, Payoneer, crypto) with primary selection
11. ai_customer_insights — AI-generated business insights (churn risk, complaints, trending topics, etc.)

## Security
- RLS enabled on ALL tables
- Users can read/update their own payout_methods and view their own timeline
- Admins (is_admin = true) get full CRUD on CRM tables via auth.uid() ownership check
- customer_timelines: users read own, admins read all
- subscription_reminders: users read own, admins read all
- All tables follow the pattern: 4 separate policies (SELECT/INSERT/UPDATE/DELETE)
- Soft delete via is_deleted column on all tables

## Important Notes
1. All tables use UUID primary keys with gen_random_uuid() default
2. All tables have created_by, updated_by, created_at, updated_at, status, is_deleted columns
3. RLS checks auth.uid() for ownership; admin tables check is_admin flag on users table
*/

-- ============================================================
-- 1. crm_customers
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_status text NOT NULL DEFAULT 'active',
  lifetime_value numeric(14,2) NOT NULL DEFAULT 0,
  total_purchases integer NOT NULL DEFAULT 0,
  total_sales integer NOT NULL DEFAULT 0,
  total_earnings numeric(14,2) NOT NULL DEFAULT 0,
  total_withdrawals numeric(14,2) NOT NULL DEFAULT 0,
  pending_withdrawals numeric(14,2) NOT NULL DEFAULT 0,
  wallet_balance numeric(14,2) NOT NULL DEFAULT 0,
  reviews_received integer NOT NULL DEFAULT 0,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  referral_count integer NOT NULL DEFAULT 0,
  affiliate_performance jsonb NOT NULL DEFAULT '{}',
  seller_performance jsonb NOT NULL DEFAULT '{}',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  last_contacted_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_crm_customers" ON crm_customers;
CREATE POLICY "select_crm_customers" ON crm_customers FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_crm_customers" ON crm_customers;
CREATE POLICY "insert_crm_customers" ON crm_customers FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_crm_customers" ON crm_customers;
CREATE POLICY "update_crm_customers" ON crm_customers FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_crm_customers" ON crm_customers;
CREATE POLICY "delete_crm_customers" ON crm_customers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 2. customer_timelines
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_category text NOT NULL DEFAULT 'general',
  event_title text NOT NULL,
  event_description text,
  event_data jsonb NOT NULL DEFAULT '{}',
  related_entity_type text,
  related_entity_id uuid,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_timelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customer_timelines" ON customer_timelines;
CREATE POLICY "select_customer_timelines" ON customer_timelines FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_customer_timelines" ON customer_timelines;
CREATE POLICY "insert_customer_timelines" ON customer_timelines FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_customer_timelines" ON customer_timelines;
CREATE POLICY "update_customer_timelines" ON customer_timelines FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_customer_timelines" ON customer_timelines;
CREATE POLICY "delete_customer_timelines" ON customer_timelines FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 3. subscription_reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type text NOT NULL,
  subscription_id uuid,
  expiry_date timestamptz NOT NULL,
  reminder_stage text NOT NULL DEFAULT 'pending',
  reminder_offset_days integer NOT NULL DEFAULT 0,
  channel text NOT NULL DEFAULT 'email',
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subscription_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_subscription_reminders" ON subscription_reminders;
CREATE POLICY "select_subscription_reminders" ON subscription_reminders FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_subscription_reminders" ON subscription_reminders;
CREATE POLICY "insert_subscription_reminders" ON subscription_reminders FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_subscription_reminders" ON subscription_reminders;
CREATE POLICY "update_subscription_reminders" ON subscription_reminders FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_subscription_reminders" ON subscription_reminders;
CREATE POLICY "delete_subscription_reminders" ON subscription_reminders FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 4. customer_recovery_queue
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_recovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_reason text NOT NULL,
  related_entity_type text,
  related_entity_id uuid,
  related_data jsonb NOT NULL DEFAULT '{}',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes text,
  follow_up_date timestamptz,
  last_reminder_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_recovery_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_recovery_queue" ON customer_recovery_queue;
CREATE POLICY "select_recovery_queue" ON customer_recovery_queue FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_recovery_queue" ON customer_recovery_queue;
CREATE POLICY "insert_recovery_queue" ON customer_recovery_queue FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_recovery_queue" ON customer_recovery_queue;
CREATE POLICY "update_recovery_queue" ON customer_recovery_queue FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_recovery_queue" ON customer_recovery_queue;
CREATE POLICY "delete_recovery_queue" ON customer_recovery_queue FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 5. customer_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_app',
  subject text,
  summary text NOT NULL,
  follow_up_reminder timestamptz,
  outcome text NOT NULL DEFAULT 'open',
  contact_method_used text,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customer_contacts" ON customer_contacts;
CREATE POLICY "select_customer_contacts" ON customer_contacts FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR auth.uid() = staff_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_customer_contacts" ON customer_contacts;
CREATE POLICY "insert_customer_contacts" ON customer_contacts FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = staff_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_customer_contacts" ON customer_contacts;
CREATE POLICY "update_customer_contacts" ON customer_contacts FOR UPDATE
  TO authenticated USING (
    auth.uid() = staff_id OR auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    auth.uid() = staff_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_customer_contacts" ON customer_contacts;
CREATE POLICY "delete_customer_contacts" ON customer_contacts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 6. customer_contact_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES customer_contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type text NOT NULL DEFAULT 'message',
  content text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_contact_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_contact_logs" ON customer_contact_logs;
CREATE POLICY "select_contact_logs" ON customer_contact_logs FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR auth.uid() = staff_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_contact_logs" ON customer_contact_logs;
CREATE POLICY "insert_contact_logs" ON customer_contact_logs FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = staff_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_contact_logs" ON customer_contact_logs;
CREATE POLICY "update_contact_logs" ON customer_contact_logs FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_contact_logs" ON customer_contact_logs;
CREATE POLICY "delete_contact_logs" ON customer_contact_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 7. marketing_campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  campaign_type text NOT NULL,
  entity_type text NOT NULL DEFAULT 'product',
  entity_id uuid,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  budget numeric(14,2) NOT NULL DEFAULT 0,
  spent numeric(14,2) NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  targeting jsonb NOT NULL DEFAULT '{}',
  is_paid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_marketing_campaigns" ON marketing_campaigns;
CREATE POLICY "select_marketing_campaigns" ON marketing_campaigns FOR SELECT
  TO authenticated USING (
    auth.uid() = owner_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_marketing_campaigns" ON marketing_campaigns;
CREATE POLICY "insert_marketing_campaigns" ON marketing_campaigns FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = owner_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_marketing_campaigns" ON marketing_campaigns;
CREATE POLICY "update_marketing_campaigns" ON marketing_campaigns FOR UPDATE
  TO authenticated USING (
    auth.uid() = owner_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    auth.uid() = owner_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_marketing_campaigns" ON marketing_campaigns;
CREATE POLICY "delete_marketing_campaigns" ON marketing_campaigns FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 8. promotion_statistics
-- ============================================================
CREATE TABLE IF NOT EXISTS promotion_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'product',
  entity_id uuid,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  engagement bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  revenue_generated numeric(14,2) NOT NULL DEFAULT 0,
  budget numeric(14,2) NOT NULL DEFAULT 0,
  remaining_budget numeric(14,2) NOT NULL DEFAULT 0,
  recording_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE promotion_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_promotion_statistics" ON promotion_statistics;
CREATE POLICY "select_promotion_statistics" ON promotion_statistics FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_promotion_statistics" ON promotion_statistics;
CREATE POLICY "insert_promotion_statistics" ON promotion_statistics FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_promotion_statistics" ON promotion_statistics;
CREATE POLICY "update_promotion_statistics" ON promotion_statistics FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_promotion_statistics" ON promotion_statistics;
CREATE POLICY "delete_promotion_statistics" ON promotion_statistics FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 9. admin_performance
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL DEFAULT 'daily',
  period_start date NOT NULL,
  period_end date NOT NULL,
  tickets_resolved integer NOT NULL DEFAULT 0,
  avg_response_time_minutes numeric(10,2) NOT NULL DEFAULT 0,
  customer_satisfaction_score numeric(3,2) NOT NULL DEFAULT 0,
  listings_approved integer NOT NULL DEFAULT 0,
  listings_rejected integer NOT NULL DEFAULT 0,
  marketing_recoveries integer NOT NULL DEFAULT 0,
  subscription_renewals_recovered integer NOT NULL DEFAULT 0,
  revenue_influenced numeric(14,2) NOT NULL DEFAULT 0,
  promotions_managed integer NOT NULL DEFAULT 0,
  compliance_reviews_completed integer NOT NULL DEFAULT 0,
  total_score numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_admin_performance" ON admin_performance;
CREATE POLICY "select_admin_performance" ON admin_performance FOR SELECT
  TO authenticated USING (
    auth.uid() = admin_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_admin_performance" ON admin_performance;
CREATE POLICY "insert_admin_performance" ON admin_performance FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_admin_performance" ON admin_performance;
CREATE POLICY "update_admin_performance" ON admin_performance FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_admin_performance" ON admin_performance;
CREATE POLICY "delete_admin_performance" ON admin_performance FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- 10. payout_methods
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_type text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  -- Bank fields
  account_holder_name text,
  bank_name text,
  account_number text,
  bank_code text,
  account_nickname text,
  -- PayPal
  paypal_email text,
  -- Payoneer
  payoneer_email text,
  -- Crypto
  crypto_currency text,
  crypto_network text,
  crypto_wallet_address text,
  crypto_wallet_nickname text,
  -- Metadata
  is_verified boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payout_methods" ON payout_methods;
CREATE POLICY "select_payout_methods" ON payout_methods FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_payout_methods" ON payout_methods;
CREATE POLICY "insert_payout_methods" ON payout_methods FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_payout_methods" ON payout_methods;
CREATE POLICY "update_payout_methods" ON payout_methods FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_payout_methods" ON payout_methods;
CREATE POLICY "delete_payout_methods" ON payout_methods FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 11. ai_customer_insights
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_customer_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type text NOT NULL,
  insight_category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  description text,
  affected_user_ids uuid[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  confidence_score numeric(4,3) NOT NULL DEFAULT 0,
  recommended_action text,
  ai_provider text NOT NULL DEFAULT 'openai',
  ai_model text,
  insight_data jsonb NOT NULL DEFAULT '{}',
  is_dismissed boolean NOT NULL DEFAULT false,
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_customer_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_ai_insights" ON ai_customer_insights;
CREATE POLICY "select_ai_insights" ON ai_customer_insights FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "insert_ai_insights" ON ai_customer_insights;
CREATE POLICY "insert_ai_insights" ON ai_customer_insights FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "update_ai_insights" ON ai_customer_insights;
CREATE POLICY "update_ai_insights" ON ai_customer_insights FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );
DROP POLICY IF EXISTS "delete_ai_insights" ON ai_customer_insights;
CREATE POLICY "delete_ai_insights" ON ai_customer_insights FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_crm_customers_user_id ON crm_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_timelines_user_id ON customer_timelines(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_timelines_created_at ON customer_timelines(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_reminders_user_id ON subscription_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_reminders_expiry ON subscription_reminders(expiry_date);
CREATE INDEX IF NOT EXISTS idx_recovery_queue_user_id ON customer_recovery_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_queue_status ON customer_recovery_queue(status);
CREATE INDEX IF NOT EXISTS idx_recovery_queue_assigned ON customer_recovery_queue(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_user_id ON customer_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_staff_id ON customer_contacts(staff_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_id ON customer_contact_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_owner ON marketing_campaigns(owner_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_promotion_statistics_campaign ON promotion_statistics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promotion_statistics_date ON promotion_statistics(recording_date);
CREATE INDEX IF NOT EXISTS idx_admin_performance_admin ON admin_performance(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_performance_period ON admin_performance(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_payout_methods_user_id ON payout_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_methods_primary ON payout_methods(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_customer_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_dismissed ON ai_customer_insights(is_dismissed);
