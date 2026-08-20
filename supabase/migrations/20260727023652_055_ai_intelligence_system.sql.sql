/*
# DRIGHT Phase 6 — AI Marketplace Intelligence & Smart Assistants

## New Tables
1. ai_conversations — Chat history with the AI assistant
2. ai_quality_scores — Listing quality scores (0-100) with breakdown
3. ai_recommendations — AI-generated recommendations for users
4. ai_forecasts — Predictive analytics with confidence levels
5. ai_reports — Auto-generated marketplace reports
6. ai_prediction_logs — Prediction accuracy tracking
7. ai_prompt_history — AI interaction logs for privacy controls
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. AI CONVERSATIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  -- user | assistant | system
  content text NOT NULL,
  context_type text,
  -- product | seller | buyer | affiliate | admin | general
  context_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON ai_conversations;
CREATE POLICY "select_own_conversations"
  ON ai_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_conversations" ON ai_conversations;
CREATE POLICY "insert_own_conversations"
  ON ai_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_conversations" ON ai_conversations;
CREATE POLICY "delete_own_conversations"
  ON ai_conversations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AI QUALITY SCORES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  overall_score integer NOT NULL DEFAULT 0,
  title_score integer NOT NULL DEFAULT 0,
  description_score integer NOT NULL DEFAULT 0,
  image_score integer NOT NULL DEFAULT 0,
  pricing_score integer NOT NULL DEFAULT 0,
  keyword_score integer NOT NULL DEFAULT 0,
  engagement_score integer NOT NULL DEFAULT 0,
  conversion_score integer NOT NULL DEFAULT 0,
  suggestions jsonb,
  estimated_impact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id)
);

ALTER TABLE ai_quality_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quality_scores" ON ai_quality_scores;
CREATE POLICY "select_quality_scores"
  ON ai_quality_scores FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_quality_scores" ON ai_quality_scores;
CREATE POLICY "insert_quality_scores"
  ON ai_quality_scores FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "update_quality_scores" ON ai_quality_scores;
CREATE POLICY "update_quality_scores"
  ON ai_quality_scores FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_quality_listing ON ai_quality_scores(listing_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. AI RECOMMENDATIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL,
  -- product | service | pricing | seo | promotion | category | improvement
  title text NOT NULL,
  description text,
  confidence numeric NOT NULL DEFAULT 0,
  metadata jsonb,
  is_dismissed boolean NOT NULL DEFAULT false,
  is_acted_on boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recommendations" ON ai_recommendations;
CREATE POLICY "select_own_recommendations"
  ON ai_recommendations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recommendations" ON ai_recommendations;
CREATE POLICY "insert_own_recommendations"
  ON ai_recommendations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recommendations" ON ai_recommendations;
CREATE POLICY "update_own_recommendations"
  ON ai_recommendations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_rec_user ON ai_recommendations(user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. AI FORECASTS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_type text NOT NULL,
  -- category_growth | demand_trend | seasonal | search_trend | promotion_performance
  target text NOT NULL,
  prediction jsonb NOT NULL,
  confidence_level numeric NOT NULL DEFAULT 0,
  time_horizon text NOT NULL DEFAULT '30d',
  -- 7d | 30d | 90d
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_forecasts" ON ai_forecasts;
CREATE POLICY "select_forecasts"
  ON ai_forecasts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_forecasts" ON ai_forecasts;
CREATE POLICY "admin_insert_forecasts"
  ON ai_forecasts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_forecasts_type ON ai_forecasts(forecast_type, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. AI REPORTS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  -- daily_summary | weekly_trends | monthly_growth | seller_performance | promotion_performance | search_trends | category_performance
  title text NOT NULL,
  summary text,
  data jsonb,
  period_start date NOT NULL,
  period_end date NOT NULL,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reports" ON ai_reports;
CREATE POLICY "select_reports"
  ON ai_reports FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_reports" ON ai_reports;
CREATE POLICY "admin_insert_reports"
  ON ai_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_reports_type ON ai_reports(report_type, period_start DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. AI PREDICTION LOGS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_prediction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_type text NOT NULL,
  predicted_value numeric,
  actual_value numeric,
  accuracy numeric,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_prediction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_predictions" ON ai_prediction_logs;
CREATE POLICY "admin_select_predictions"
  ON ai_prediction_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_predictions" ON ai_prediction_logs;
CREATE POLICY "admin_insert_predictions"
  ON ai_prediction_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_predictions_type ON ai_prediction_logs(prediction_type, created_at DESC);
