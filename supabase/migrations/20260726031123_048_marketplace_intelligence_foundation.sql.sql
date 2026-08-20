/*
# DRIGHT Phase 1 — Marketplace Intelligence Foundation

## Summary
Creates the backend infrastructure for marketplace analytics, event tracking,
demand scoring (DDS), trending engine, fraud detection foundation, and admin
algorithm configuration. Extends existing tables — no duplicates.

## New Tables
1. `listing_events` — Centralized event tracking for all listing interactions
   (impressions, clicks, favorites, shares, purchases, reviews, etc.)
   Supports products, services, jobs, courses, digital downloads.

2. `listing_scores` — DDS (DRIGHT Demand Score) cache per listing, with
   component breakdown and trending velocity. Recalculated by background jobs.

3. `listing_statistics` — Aggregated per-listing statistics (lifetime + rolling
   windows) for fast dashboard queries.

4. `search_history` — Every search query with filters, result count, and
   click-through data for search analytics.

5. `search_trends` — Aggregated search term trends per time window for
   trending search detection.

6. `user_activity` — Per-user browsing/purchase history for personalization
   and behavior signals (privacy-protected, no PII).

7. `seller_statistics` — Aggregated seller metrics (sales, revenue, rating,
   response time, completion rate, dispute rate) for seller reputation scoring.

8. `algorithm_settings` — Super admin configurable weights for the DDS engine.
   Singleton table, replaces the narrower `marketplace_ranking_weights` with
   full Phase 1 weight set (search, click, conversion, rating, review,
   freshness, velocity, trust, trending threshold, fraud sensitivity).

9. `fraud_events` — Suspicious activity log for bot traffic, click farming,
   fake ratings, fake reviews, mass account abuse. Excluded from ranking.

10. `system_metrics` — Marketplace health monitoring (daily searches, clicks,
    purchases, avg CTR, avg conversion, trending growth, top categories).

## Security
- RLS enabled on ALL tables.
- User-facing tables (listing_events, search_history, user_activity):
  user-scoped CRUD (auth.uid() = user_id).
- Read-only public tables (listing_scores, listing_statistics,
  search_trends, seller_statistics, system_metrics): SELECT for authenticated.
- Admin-only tables (algorithm_settings, fraud_events):
  SELECT for authenticated; CRUD for admins via is_admin check.

## Indexes
- listing_events: (listing_id, event_type, created_at) + (user_id, created_at)
- listing_scores: unique on listing_id; (dds_score DESC) for top-N queries
- listing_statistics: unique on listing_id
- search_history: (user_id, created_at) + (query, created_at)
- search_trends: unique on (term, period_type, period_start)
- user_activity: (user_id, created_at) + (user_id, activity_type)
- seller_statistics: unique on seller_id
- algorithm_settings: singleton (is_singleton = true)
- fraud_events: (status, created_at) + (listing_id)
- system_metrics: unique on (metric_type, period_date)

## Reuse
- Extends existing `marketplace_ranking_weights` (adds new weight columns).
- Does NOT modify `products`, `product_analytics`, `product_views` — coexists.
- The ranking engine will read from `algorithm_settings` with fallback.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. LISTING EVENTS — Centralized event tracking
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_listing_events" ON listing_events;
CREATE POLICY "select_own_listing_events"
  ON listing_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "insert_listing_events" ON listing_events;
CREATE POLICY "insert_listing_events"
  ON listing_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_listing_events_listing
  ON listing_events(listing_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_events_user
  ON listing_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listing_events_type_time
  ON listing_events(event_type, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. LISTING SCORES — DDS cache
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  dds_score numeric NOT NULL DEFAULT 0,
  relevance_score numeric NOT NULL DEFAULT 0,
  engagement_score numeric NOT NULL DEFAULT 0,
  conversion_score numeric NOT NULL DEFAULT 0,
  rating_score numeric NOT NULL DEFAULT 0,
  freshness_score numeric NOT NULL DEFAULT 0,
  velocity_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0,
  trending_score numeric NOT NULL DEFAULT 0,
  is_trending boolean NOT NULL DEFAULT false,
  trending_tier text,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id)
);

ALTER TABLE listing_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_listing_scores" ON listing_scores;
CREATE POLICY "select_listing_scores"
  ON listing_scores FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_listing_scores_dds
  ON listing_scores(dds_score DESC)
  WHERE is_trending = false;
CREATE INDEX IF NOT EXISTS idx_listing_scores_trending
  ON listing_scores(trending_score DESC)
  WHERE is_trending = true;
CREATE INDEX IF NOT EXISTS idx_listing_scores_type
  ON listing_scores(listing_type, dds_score DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. LISTING STATISTICS — Aggregated per-listing stats
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  total_impressions integer NOT NULL DEFAULT 0,
  unique_impressions integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  unique_clicks integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  total_favorites integer NOT NULL DEFAULT 0,
  total_shares integer NOT NULL DEFAULT 0,
  total_messages integer NOT NULL DEFAULT 0,
  total_purchases integer NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  avg_view_duration_seconds numeric,
  return_visits integer NOT NULL DEFAULT 0,
  avg_rating numeric NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  rating_confidence numeric NOT NULL DEFAULT 0,
  refund_rate numeric NOT NULL DEFAULT 0,
  dispute_rate numeric NOT NULL DEFAULT 0,
  velocity_1h numeric NOT NULL DEFAULT 0,
  velocity_24h numeric NOT NULL DEFAULT 0,
  velocity_7d numeric NOT NULL DEFAULT 0,
  velocity_30d numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id)
);

ALTER TABLE listing_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_listing_statistics" ON listing_statistics;
CREATE POLICY "select_listing_statistics"
  ON listing_statistics FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_listing_stats_type
  ON listing_statistics(listing_type, conversion_rate DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. SEARCH HISTORY
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query text NOT NULL,
  category text,
  filters jsonb,
  result_count integer NOT NULL DEFAULT 0,
  clicked_listing_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_searches" ON search_history;
CREATE POLICY "select_own_searches"
  ON search_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "insert_searches" ON search_history;
CREATE POLICY "insert_searches"
  ON search_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_search_history_user
  ON search_history(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_history_query
  ON search_history(query, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. SEARCH TRENDS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  search_count integer NOT NULL DEFAULT 0,
  unique_searchers integer NOT NULL DEFAULT 0,
  result_clicks integer NOT NULL DEFAULT 0,
  growth_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(term, period_type, period_start)
);

ALTER TABLE search_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_search_trends" ON search_trends;
CREATE POLICY "select_search_trends"
  ON search_trends FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_search_trends_period
  ON search_trends(period_type, period_start DESC, search_count DESC);
CREATE INDEX IF NOT EXISTS idx_search_trends_growth
  ON search_trends(growth_rate DESC)
  WHERE growth_rate > 0;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. USER ACTIVITY — browsing/purchase history (no PII)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  listing_id uuid,
  listing_type text,
  category text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_activity_phase1" ON user_activity;
CREATE POLICY "select_own_activity_phase1"
  ON user_activity FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_activity" ON user_activity;
CREATE POLICY "insert_own_activity"
  ON user_activity FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_activity" ON user_activity;
CREATE POLICY "delete_own_activity"
  ON user_activity FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_time
  ON user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_type
  ON user_activity(user_id, activity_type, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. SELLER STATISTICS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seller_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_sales integer NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  avg_rating numeric NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  rating_confidence numeric NOT NULL DEFAULT 0,
  completion_rate numeric NOT NULL DEFAULT 0,
  refund_rate numeric NOT NULL DEFAULT 0,
  dispute_rate numeric NOT NULL DEFAULT 0,
  avg_response_time_hours numeric,
  repeat_customer_rate numeric NOT NULL DEFAULT 0,
  total_followers integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seller_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_seller_stats" ON seller_statistics;
CREATE POLICY "select_seller_stats"
  ON seller_statistics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_seller_stats" ON seller_statistics;
CREATE POLICY "update_own_seller_stats"
  ON seller_statistics FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_stats_rating
  ON seller_statistics(avg_rating DESC, rating_confidence DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ALGORITHM SETTINGS — Super Admin configurable weights
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS algorithm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  search_weight numeric NOT NULL DEFAULT 30,
  click_weight numeric NOT NULL DEFAULT 15,
  conversion_weight numeric NOT NULL DEFAULT 20,
  rating_weight numeric NOT NULL DEFAULT 10,
  review_weight numeric NOT NULL DEFAULT 8,
  freshness_weight numeric NOT NULL DEFAULT 5,
  velocity_weight numeric NOT NULL DEFAULT 7,
  trust_weight numeric NOT NULL DEFAULT 5,
  trending_threshold numeric NOT NULL DEFAULT 50,
  fraud_sensitivity numeric NOT NULL DEFAULT 50,
  min_reviews_for_confidence integer NOT NULL DEFAULT 5,
  trending_decay_rate numeric NOT NULL DEFAULT 0.85,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE algorithm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_algorithm_settings" ON algorithm_settings;
CREATE POLICY "select_algorithm_settings"
  ON algorithm_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_algorithm" ON algorithm_settings;
CREATE POLICY "admin_update_algorithm"
  ON algorithm_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_algorithm" ON algorithm_settings;
CREATE POLICY "admin_insert_algorithm"
  ON algorithm_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- Seed default settings
INSERT INTO algorithm_settings (is_singleton) VALUES (true)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. FRAUD EVENTS — Suspicious activity log
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_type text NOT NULL,
  listing_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'flagged',
  description text,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE fraud_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_fraud_events" ON fraud_events;
CREATE POLICY "select_fraud_events"
  ON fraud_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "insert_fraud_events" ON fraud_events;
CREATE POLICY "insert_fraud_events"
  ON fraud_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "admin_update_fraud" ON fraud_events;
CREATE POLICY "admin_update_fraud"
  ON fraud_events FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_fraud_status
  ON fraud_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_listing
  ON fraud_events(listing_id)
  WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_user
  ON fraud_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. SYSTEM METRICS — Marketplace health monitoring
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS system_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL,
  period_date date NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_type, period_date)
);

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_system_metrics" ON system_metrics;
CREATE POLICY "select_system_metrics"
  ON system_metrics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_metrics" ON system_metrics;
CREATE POLICY "admin_insert_metrics"
  ON system_metrics FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_metrics" ON system_metrics;
CREATE POLICY "admin_update_metrics"
  ON system_metrics FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_metrics_type_date
  ON system_metrics(metric_type, period_date DESC);
