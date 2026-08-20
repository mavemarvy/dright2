-- Phase 5 — Trust, Verification & Marketplace Integrity (remaining tables + RPCs)

-- ============================================================
-- 1. Trust Scores
-- ============================================================
CREATE TABLE IF NOT EXISTS trust_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  level text NOT NULL DEFAULT 'building',
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_calculated timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(score DESC);
ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_trust_score" ON trust_scores;
CREATE POLICY "select_own_trust_score" ON trust_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_trust_scores" ON trust_scores;
CREATE POLICY "admin_all_trust_scores" ON trust_scores FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 2. Seller Scores
-- ============================================================
CREATE TABLE IF NOT EXISTS seller_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_rating numeric(3,2) NOT NULL DEFAULT 0,
  communication_score numeric(3,2) NOT NULL DEFAULT 0,
  delivery_score numeric(3,2) NOT NULL DEFAULT 0,
  product_accuracy numeric(3,2) NOT NULL DEFAULT 0,
  refund_score numeric(3,2) NOT NULL DEFAULT 0,
  customer_satisfaction numeric(3,2) NOT NULL DEFAULT 0,
  ai_quality_score numeric(3,2) NOT NULL DEFAULT 0,
  portfolio_score numeric(3,2) NOT NULL DEFAULT 0,
  response_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_response_time_minutes int NOT NULL DEFAULT 0,
  total_sales int NOT NULL DEFAULT 0,
  total_reviews int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seller_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_seller_scores" ON seller_scores;
CREATE POLICY "select_all_seller_scores" ON seller_scores FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. Verification Requests (KYC)
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'individual' CHECK (type IN ('individual','business')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('submitted','pending','approved','rejected','needs_more_info')),
  admin_notes text,
  reviewed_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verif_req_status ON verification_requests(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_verif_req_user ON verification_requests(user_id);
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_verif_req" ON verification_requests;
CREATE POLICY "select_own_verif_req" ON verification_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_verif_req" ON verification_requests;
CREATE POLICY "insert_own_verif_req" ON verification_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_verif_req" ON verification_requests;
CREATE POLICY "update_own_verif_req" ON verification_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_verif_req" ON verification_requests;
CREATE POLICY "admin_all_verif_req" ON verification_requests FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 4. Verification Documents
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id uuid NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verif_docs_req ON verification_documents(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_verif_docs_user ON verification_documents(user_id);
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_verif_docs" ON verification_documents;
CREATE POLICY "select_own_verif_docs" ON verification_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_verif_docs" ON verification_documents;
CREATE POLICY "insert_own_verif_docs" ON verification_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_verif_docs" ON verification_documents;
CREATE POLICY "admin_all_verif_docs" ON verification_documents FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 5. Verification Badges
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type text NOT NULL,
  badge_name text NOT NULL,
  description text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  earned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_badges_user ON verification_badges(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_badges_type ON verification_badges(badge_type);
ALTER TABLE verification_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_badges" ON verification_badges;
CREATE POLICY "select_all_badges" ON verification_badges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_badges" ON verification_badges;
CREATE POLICY "insert_own_badges" ON verification_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_badges" ON verification_badges;
CREATE POLICY "admin_all_badges" ON verification_badges FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 6. Portfolio Verifications
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_item_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_edits','copyrighted','duplicate_flagged')),
  reviewer_id uuid,
  review_notes text,
  is_copyrighted boolean NOT NULL DEFAULT false,
  is_duplicate boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_verif_status ON portfolio_verifications(status);
CREATE INDEX IF NOT EXISTS idx_portfolio_verif_user ON portfolio_verifications(user_id);
ALTER TABLE portfolio_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_portfolio_verif" ON portfolio_verifications;
CREATE POLICY "select_own_portfolio_verif" ON portfolio_verifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_portfolio_verif" ON portfolio_verifications;
CREATE POLICY "insert_own_portfolio_verif" ON portfolio_verifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_portfolio_verif" ON portfolio_verifications;
CREATE POLICY "admin_all_portfolio_verif" ON portfolio_verifications FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 7. Review Votes
-- ============================================================
CREATE TABLE IF NOT EXISTS review_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type text NOT NULL DEFAULT 'helpful' CHECK (vote_type IN ('helpful','not_helpful','like')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON review_votes(user_id);
ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_review_votes" ON review_votes;
CREATE POLICY "select_all_review_votes" ON review_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_review_vote" ON review_votes;
CREATE POLICY "insert_own_review_vote" ON review_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_review_vote" ON review_votes;
CREATE POLICY "delete_own_review_vote" ON review_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. Review Reports
-- ============================================================
CREATE TABLE IF NOT EXISTS review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  admin_notes text,
  ai_confidence_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_review_reports_status ON review_reports(status);
ALTER TABLE review_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_review_reports" ON review_reports;
CREATE POLICY "select_own_review_reports" ON review_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "insert_own_review_reports" ON review_reports;
CREATE POLICY "insert_own_review_reports" ON review_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "admin_all_review_reports" ON review_reports;
CREATE POLICY "admin_all_review_reports" ON review_reports FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 9. Disputes
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number text NOT NULL UNIQUE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid,
  transaction_id uuid,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','seller_responded','under_review','resolved_buyer','resolved_seller','resolved_admin','escalated','closed','appealed')),
  buyer_claim_amount numeric(12,2),
  resolution_amount numeric(12,2),
  admin_id uuid,
  admin_decision text,
  ai_summary text,
  escrow_released boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer ON disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_seller ON disputes(seller_id);
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_disputes" ON disputes;
CREATE POLICY "select_own_disputes" ON disputes FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
DROP POLICY IF EXISTS "insert_own_disputes" ON disputes;
CREATE POLICY "insert_own_disputes" ON disputes FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "update_own_disputes" ON disputes;
CREATE POLICY "update_own_disputes" ON disputes FOR UPDATE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id) WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);
DROP POLICY IF EXISTS "admin_all_disputes" ON disputes;
CREATE POLICY "admin_all_disputes" ON disputes FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 10. Dispute Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS dispute_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_admin_message boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_msgs_dispute ON dispute_messages(dispute_id, created_at);
ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_dispute_msgs" ON dispute_messages;
CREATE POLICY "select_own_dispute_msgs" ON dispute_messages FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM disputes d WHERE d.id = dispute_id AND (d.buyer_id = auth.uid() OR d.seller_id = auth.uid()))
  OR is_admin_user()
);
DROP POLICY IF EXISTS "insert_dispute_msgs" ON dispute_messages;
CREATE POLICY "insert_dispute_msgs" ON dispute_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM disputes d WHERE d.id = dispute_id AND (d.buyer_id = auth.uid() OR d.seller_id = auth.uid()))
  OR is_admin_user()
);

-- ============================================================
-- 11. Dispute Evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);
ALTER TABLE dispute_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_dispute_evidence" ON dispute_evidence;
CREATE POLICY "select_own_dispute_evidence" ON dispute_evidence FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM disputes d WHERE d.id = dispute_id AND (d.buyer_id = auth.uid() OR d.seller_id = auth.uid()))
  OR is_admin_user()
);
DROP POLICY IF EXISTS "insert_dispute_evidence" ON dispute_evidence;
CREATE POLICY "insert_dispute_evidence" ON dispute_evidence FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM disputes d WHERE d.id = dispute_id AND (d.buyer_id = auth.uid() OR d.seller_id = auth.uid()))
);

-- ============================================================
-- 12. Achievements Catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','sales','affiliate','advertiser','community','trust','marketplace','creator')),
  xp int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  reward text,
  requirement jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum','diamond')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_achievements_active ON achievements(is_active, category);
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_achievements" ON achievements;
CREATE POLICY "select_all_achievements" ON achievements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all_achievements" ON achievements;
CREATE POLICY "admin_all_achievements" ON achievements FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 13. Achievement Progress
-- ============================================================
CREATE TABLE IF NOT EXISTS achievement_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress int NOT NULL DEFAULT 0,
  target int NOT NULL DEFAULT 1,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_achv_progress_user ON achievement_progress(user_id, is_completed);
CREATE INDEX IF NOT EXISTS idx_achv_progress_achv ON achievement_progress(achievement_id);
ALTER TABLE achievement_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_achv_progress" ON achievement_progress;
CREATE POLICY "select_all_achv_progress" ON achievement_progress FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_achv_progress" ON achievement_progress;
CREATE POLICY "insert_own_achv_progress" ON achievement_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_achv_progress" ON achievement_progress;
CREATE POLICY "update_own_achv_progress" ON achievement_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_achv_progress" ON achievement_progress;
CREATE POLICY "admin_all_achv_progress" ON achievement_progress FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 14. Leaderboard Snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('sellers','affiliates','advertisers','creators','reviewers','buyers','referrers','rising','trusted')),
  period text NOT NULL CHECK (period IN ('weekly','monthly','yearly','all_time')),
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cat_period ON leaderboard_snapshots(category, period, snapshot_date DESC);
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_leaderboards" ON leaderboard_snapshots;
CREATE POLICY "select_all_leaderboards" ON leaderboard_snapshots FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 15. Risk Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_score int NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text,
  last_assessed timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_score ON risk_profiles(risk_score DESC);
ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_risk_profile" ON risk_profiles;
CREATE POLICY "select_own_risk_profile" ON risk_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_risk_profiles" ON risk_profiles;
CREATE POLICY "admin_all_risk_profiles" ON risk_profiles FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 16. Trust History (Audit Log)
-- ============================================================
CREATE TABLE IF NOT EXISTS trust_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_score int,
  new_score int,
  delta int,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trust_history_user ON trust_history(user_id, created_at DESC);
ALTER TABLE trust_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_trust_history" ON trust_history;
CREATE POLICY "select_own_trust_history" ON trust_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_trust_history" ON trust_history;
CREATE POLICY "admin_all_trust_history" ON trust_history FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 17. Seed Default Achievements
-- ============================================================
INSERT INTO achievements (slug, name, description, icon, category, xp, points, tier, requirement) VALUES
  ('first_sale', 'First Sale', 'Complete your first sale', 'shopping_bag', 'sales', 50, 10, 'bronze', '{"metric":"total_sales","target":1}'),
  ('ten_sales', '10 Sales', 'Complete 10 sales', 'shopping_cart', 'sales', 100, 25, 'silver', '{"metric":"total_sales","target":10}'),
  ('hundred_sales', '100 Sales', 'Complete 100 sales', 'storefront', 'sales', 500, 100, 'gold', '{"metric":"total_sales","target":100}'),
  ('top_seller', 'Top Seller', 'Reach top 10 on seller leaderboard', 'emoji_events', 'sales', 1000, 250, 'platinum', '{"metric":"leaderboard_rank","target":10}'),
  ('top_affiliate', 'Top Affiliate', 'Reach top 10 on affiliate leaderboard', 'campaign', 'affiliate', 1000, 250, 'platinum', '{"metric":"affiliate_rank","target":10}'),
  ('top_advertiser', 'Top Advertiser', 'Reach top 10 on advertiser leaderboard', 'ads_click', 'advertiser', 1000, 250, 'platinum', '{"metric":"advertiser_rank","target":10}'),
  ('community_helper', 'Community Helper', 'Help 50 community members', 'volunteer_activism', 'community', 200, 50, 'silver', '{"metric":"help_count","target":50}'),
  ('verified_business', 'Verified Business', 'Complete business verification', 'verified', 'trust', 300, 75, 'gold', '{"metric":"business_verified","target":1}'),
  ('trusted_seller', 'Trusted Seller', 'Achieve a trust score of 80+', 'shield', 'trust', 400, 100, 'gold', '{"metric":"trust_score","target":80}'),
  ('five_star_seller', '5-Star Seller', 'Maintain a 5-star average rating', 'star', 'sales', 300, 75, 'gold', '{"metric":"avg_rating","target":5}'),
  ('fast_responder', 'Fast Responder', 'Respond to messages within 1 hour on average', 'bolt', 'community', 150, 40, 'silver', '{"metric":"avg_response_minutes","target":60}'),
  ('marketplace_legend', 'Marketplace Legend', 'Complete 1000 sales', 'workspace_premium', 'marketplace', 5000, 1000, 'diamond', '{"metric":"total_sales","target":1000}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 18. RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_trust_score(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score int := 50;
  v_components jsonb := '{}'::jsonb;
  v_user RECORD;
  v_sales_count int;
  v_reviews_count int;
  v_avg_rating numeric;
  v_disputes_count int;
  v_fraud_count int;
  v_follower_count int;
  v_portfolio_count int;
  v_old_score int;
  v_level text;
  v_profile_complete int := 0;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;

  v_components := jsonb_set(v_components, '{account_age}',
    to_jsonb(LEAST(EXTRACT(EPOCH FROM (now() - v_user.created_at)) / 86400 / 30, 10)::int));

  IF v_user.email_verified_at IS NOT NULL THEN
    v_score := v_score + 10; v_components := jsonb_set(v_components, '{email_verified}', '10'::jsonb);
  ELSE v_components := jsonb_set(v_components, '{email_verified}', '0'::jsonb); END IF;

  IF v_user.id_verified THEN
    v_score := v_score + 15; v_components := jsonb_set(v_components, '{identity_verified}', '15'::jsonb);
  ELSE v_components := jsonb_set(v_components, '{identity_verified}', '0'::jsonb); END IF;

  IF v_user.business_verified THEN
    v_score := v_score + 10; v_components := jsonb_set(v_components, '{business_verified}', '10'::jsonb);
  ELSE v_components := jsonb_set(v_components, '{business_verified}', '0'::jsonb); END IF;

  SELECT COUNT(*) INTO v_sales_count FROM sales_records WHERE seller_id = p_user_id AND status = 'completed';
  v_score := v_score + LEAST(v_sales_count, 15);
  v_components := jsonb_set(v_components, '{completed_sales}', to_jsonb(LEAST(v_sales_count, 15)));

  SELECT AVG(rating), COUNT(*) INTO v_avg_rating, v_reviews_count
  FROM reviews WHERE target_id = p_user_id::text AND target_type = 'seller';
  IF v_reviews_count > 0 AND v_avg_rating IS NOT NULL THEN
    v_score := v_score + LEAST((v_avg_rating * 2)::int, 10);
    v_components := jsonb_set(v_components, '{avg_rating}', to_jsonb(LEAST((v_avg_rating * 2)::int, 10)));
  ELSE v_components := jsonb_set(v_components, '{avg_rating}', '0'::jsonb); END IF;

  SELECT COUNT(*) INTO v_disputes_count FROM disputes WHERE seller_id = p_user_id AND status NOT IN ('resolved_seller', 'closed');
  v_score := v_score - LEAST(v_disputes_count * 2, 10);
  v_components := jsonb_set(v_components, '{disputes}', to_jsonb(-LEAST(v_disputes_count * 2, 10)));

  SELECT COUNT(*) INTO v_fraud_count FROM wallet_fraud_alerts WHERE user_id = p_user_id AND is_resolved = false;
  v_score := v_score - LEAST(v_fraud_count * 5, 20);
  v_components := jsonb_set(v_components, '{fraud_alerts}', to_jsonb(-LEAST(v_fraud_count * 5, 20)));

  SELECT COUNT(*) INTO v_follower_count FROM followers WHERE followed_id = p_user_id;
  v_score := v_score + LEAST(v_follower_count / 10, 5);
  v_components := jsonb_set(v_components, '{followers}', to_jsonb(LEAST(v_follower_count / 10, 5)));

  SELECT COUNT(*) INTO v_portfolio_count FROM portfolio_verifications WHERE user_id = p_user_id AND status = 'approved';
  v_score := v_score + LEAST(v_portfolio_count, 5);
  v_components := jsonb_set(v_components, '{portfolio_verified}', to_jsonb(LEAST(v_portfolio_count, 5)));

  IF v_user.full_name IS NOT NULL AND v_user.full_name != '' THEN v_score := v_score + 1; v_profile_complete := v_profile_complete + 1; END IF;
  IF v_user.avatar_url IS NOT NULL AND v_user.avatar_url != '' THEN v_score := v_score + 1; v_profile_complete := v_profile_complete + 1; END IF;
  IF v_user.bio IS NOT NULL AND v_user.bio != '' THEN v_score := v_score + 1; v_profile_complete := v_profile_complete + 1; END IF;
  IF v_user.location IS NOT NULL AND v_user.location != '' THEN v_score := v_score + 1; v_profile_complete := v_profile_complete + 1; END IF;
  IF v_user.phone IS NOT NULL AND v_user.phone != '' THEN v_score := v_score + 1; v_profile_complete := v_profile_complete + 1; END IF;
  v_components := jsonb_set(v_components, '{profile_completeness}', to_jsonb(v_profile_complete));

  v_score := GREATEST(0, LEAST(100, v_score));

  IF v_score >= 80 THEN v_level := 'trusted';
  ELSEIF v_score >= 60 THEN v_level := 'established';
  ELSEIF v_score >= 40 THEN v_level := 'building';
  ELSE v_level := 'new'; END IF;

  SELECT score INTO v_old_score FROM trust_scores WHERE user_id = p_user_id;

  INSERT INTO trust_scores (user_id, score, level, components, last_calculated, updated_at)
  VALUES (p_user_id, v_score, v_level, v_components, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET score = v_score, level = v_level, components = v_components,
      last_calculated = now(), updated_at = now();

  IF v_old_score IS NULL OR v_old_score != v_score THEN
    INSERT INTO trust_history (user_id, event_type, old_score, new_score, delta, reason)
    VALUES (p_user_id, 'recalculated', v_old_score, v_score, v_score - COALESCE(v_old_score, 0), 'Trust score recalculated');
  END IF;

  RETURN jsonb_build_object('success', true, 'score', v_score, 'level', v_level, 'components', v_components);
END;
$$;

CREATE OR REPLACE FUNCTION get_trust_score(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('score', score, 'level', level, 'components', components, 'last_calculated', last_calculated)
     FROM trust_scores WHERE user_id = p_user_id),
    jsonb_build_object('score', 50, 'level', 'building', 'components', '{}'::jsonb, 'last_calculated', NULL)
  );
$$;

CREATE OR REPLACE FUNCTION award_badge(p_user_id uuid, p_badge_type text, p_badge_name text, p_description text DEFAULT NULL, p_icon text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO verification_badges (user_id, badge_type, badge_name, description, icon)
  VALUES (p_user_id, p_badge_type, p_badge_name, p_description, p_icon)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_badges(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(b.*) ORDER BY b.earned_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, badge_type, badge_name, description, icon, is_active, earned_at, expires_at
    FROM verification_badges WHERE user_id = p_user_id AND is_active = true
  ) b;
$$;

CREATE OR REPLACE FUNCTION get_leaderboard(p_category text DEFAULT 'sellers', p_period text DEFAULT 'monthly', p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(l.*) ORDER BY l.rank), '[]'::jsonb)
  FROM (
    SELECT
      ts.user_id,
      ts.score as trust_score,
      ts.level,
      u.full_name,
      u.username,
      u.avatar_url,
      ROW_NUMBER() OVER (ORDER BY ts.score DESC) as rank
    FROM trust_scores ts
    JOIN users u ON u.id = ts.user_id
    WHERE ts.score > 0
    ORDER BY ts.score DESC
    LIMIT p_limit
  ) l;
$$;

CREATE OR REPLACE FUNCTION get_admin_trust_center_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending_verifications', (SELECT COUNT(*) FROM verification_requests WHERE status IN ('submitted','pending')),
    'approved_verifications', (SELECT COUNT(*) FROM verification_requests WHERE status = 'approved'),
    'rejected_verifications', (SELECT COUNT(*) FROM verification_requests WHERE status = 'rejected'),
    'pending_portfolio_verifs', (SELECT COUNT(*) FROM portfolio_verifications WHERE status = 'pending'),
    'open_disputes', (SELECT COUNT(*) FROM disputes WHERE status NOT IN ('closed','resolved_admin')),
    'pending_reports', (SELECT COUNT(*) FROM user_reports WHERE status = 'pending'),
    'high_risk_users', (SELECT COUNT(*) FROM risk_profiles WHERE risk_level IN ('high','critical')),
    'trusted_users', (SELECT COUNT(*) FROM trust_scores WHERE score >= 80),
    'low_trust_users', (SELECT COUNT(*) FROM trust_scores WHERE score < 30),
    'total_badges_awarded', (SELECT COUNT(*) FROM verification_badges WHERE is_active = true),
    'achievements_unlocked', (SELECT COUNT(*) FROM achievement_progress WHERE is_completed = true),
    'review_reports_pending', (SELECT COUNT(*) FROM review_reports WHERE status = 'pending'),
    'fraud_alerts_unresolved', (SELECT COUNT(*) FROM wallet_fraud_alerts WHERE is_resolved = false)
  );
$$;

CREATE OR REPLACE FUNCTION create_dispute(
  p_buyer_id uuid,
  p_seller_id uuid,
  p_reason text,
  p_product_id uuid DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_claim_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
BEGIN
  v_number := 'DSP-' || UPPER(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 8));
  INSERT INTO disputes (dispute_number, buyer_id, seller_id, product_id, transaction_id, reason, description, buyer_claim_amount)
  VALUES (v_number, p_buyer_id, p_seller_id, p_product_id, p_transaction_id, p_reason, p_description, p_claim_amount)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id, 'dispute_number', v_number);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_trust_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trust_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION award_badge(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_badges(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_trust_center_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION create_dispute(uuid, uuid, text, uuid, uuid, text, numeric) TO authenticated;