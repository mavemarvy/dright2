/*
# Creator Campaigns & Task Marketplace — Complete Schema
Uses cc_ prefix to avoid collision with existing campaign_* tables from promotion system.
Fix: cc_settings uses uuid PK with gen_random_uuid() instead of integer default.
*/

-- ═══ 1. CATEGORIES ═══
CREATE TABLE IF NOT EXISTS cc_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_cc_categories" ON cc_categories;
CREATE POLICY "select_cc_categories" ON cc_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_manage_cc_categories" ON cc_categories;
CREATE POLICY "admin_manage_cc_categories" ON cc_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

INSERT INTO cc_categories (name, slug, sort_order) VALUES
  ('Video Editing','video-editing',1),('YouTube Clipping','youtube-clipping',2),
  ('TikTok','tiktok',3),('Instagram','instagram',4),('Facebook','facebook',5),
  ('Twitter/X','twitter-x',6),('Reviews','reviews',7),('Google Play Reviews','google-play-reviews',8),
  ('Apple App Store Reviews','apple-app-store-reviews',9),('Trustpilot Reviews','trustpilot-reviews',10),
  ('Website Reviews','website-reviews',11),('UGC Content','ugc-content',12),
  ('Affiliate Promotion','affiliate-promotion',13),('Survey','survey',14),
  ('Discord','discord',15),('Telegram','telegram',16),('Reddit','reddit',17),
  ('Pinterest','pinterest',18),('LinkedIn','linkedin',19),('Threads','threads',20),
  ('Website Testing','website-testing',21),('App Testing','app-testing',22),
  ('AI Tasks','ai-tasks',23),('Translation','translation',24),
  ('Voice Recording','voice-recording',25),('Transcription','transcription',26),
  ('Logo Design','logo-design',27),('Graphic Design','graphic-design',28),
  ('Coding','coding',29),('Writing','writing',30),('Data Entry','data-entry',31),
  ('Research','research',32),('Custom','custom',33)
ON CONFLICT (slug) DO NOTHING;

-- ═══ 2. CAMPAIGNS ═══
CREATE TABLE IF NOT EXISTS cc_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES cc_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  instructions text,
  task_type text NOT NULL DEFAULT 'custom',
  difficulty text NOT NULL DEFAULT 'easy',
  estimated_completion_time text,
  language text DEFAULT 'en',
  countries_allowed text[] DEFAULT '{}',
  minimum_user_level text DEFAULT 'bronze',
  age_requirement integer,
  tags text[] DEFAULT '{}',
  reward_per_completion numeric NOT NULL DEFAULT 0,
  max_workers integer,
  workers_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  total_budget numeric NOT NULL DEFAULT 0,
  platform_fee_percent numeric NOT NULL DEFAULT 10,
  escrow_amount numeric NOT NULL DEFAULT 0,
  verification_type text NOT NULL DEFAULT 'manual',
  evidence_types text[] DEFAULT '{}',
  requirements jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',
  is_featured boolean NOT NULL DEFAULT false,
  is_promoted boolean NOT NULL DEFAULT false,
  featured_until timestamptz,
  ends_at timestamptz,
  launched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_cmp_creator ON cc_campaigns(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_cmp_status ON cc_campaigns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_cmp_cat ON cc_campaigns(category_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cc_cmp_reward ON cc_campaigns(reward_per_completion DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cc_cmp_feat ON cc_campaigns(is_featured DESC, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cc_cmp_ends ON cc_campaigns(ends_at ASC) WHERE status = 'active';

DROP POLICY IF EXISTS "select_cc_cmp" ON cc_campaigns;
CREATE POLICY "select_cc_cmp" ON cc_campaigns FOR SELECT TO authenticated
  USING (status = 'active' OR status = 'paused' OR creator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "ins_own_cc_cmp" ON cc_campaigns;
CREATE POLICY "ins_own_cc_cmp" ON cc_campaigns FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
DROP POLICY IF EXISTS "upd_own_cc_cmp" ON cc_campaigns;
CREATE POLICY "upd_own_cc_cmp" ON cc_campaigns FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "del_own_cc_cmp" ON cc_campaigns;
CREATE POLICY "del_own_cc_cmp" ON cc_campaigns FOR DELETE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- ═══ 3. MEDIA ═══
CREATE TABLE IF NOT EXISTS cc_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image',
  file_name text,
  file_size bigint,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_media ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_media_cmp ON cc_media(campaign_id, position);
DROP POLICY IF EXISTS "sel_cc_media" ON cc_media;
CREATE POLICY "sel_cc_media" ON cc_media FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = cc_media.campaign_id
    AND (cc_campaigns.status IN ('active','paused') OR cc_campaigns.creator_id = auth.uid())));
DROP POLICY IF EXISTS "ins_cc_media" ON cc_media;
CREATE POLICY "ins_cc_media" ON cc_media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = campaign_id AND cc_campaigns.creator_id = auth.uid()));
DROP POLICY IF EXISTS "del_cc_media" ON cc_media;
CREATE POLICY "del_cc_media" ON cc_media FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = campaign_id AND cc_campaigns.creator_id = auth.uid()));

-- ═══ 4. WALLETS ═══
CREATE TABLE IF NOT EXISTS cc_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  escrow_balance numeric NOT NULL DEFAULT 0,
  total_deposited numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  total_paid_out numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE cc_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sel_own_cc_w" ON cc_wallets;
CREATE POLICY "sel_own_cc_w" ON cc_wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ins_own_cc_w" ON cc_wallets;
CREATE POLICY "ins_own_cc_w" ON cc_wallets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "upd_own_cc_w" ON cc_wallets;
CREATE POLICY "upd_own_cc_w" ON cc_wallets FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══ 5. TRANSACTIONS ═══
CREATE TABLE IF NOT EXISTS cc_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES cc_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  balance_after numeric,
  campaign_id uuid REFERENCES cc_campaigns(id) ON DELETE SET NULL,
  description text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_tx_user ON cc_transactions(user_id, created_at DESC);
DROP POLICY IF EXISTS "sel_own_cc_tx" ON cc_transactions;
CREATE POLICY "sel_own_cc_tx" ON cc_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ins_own_cc_tx" ON cc_transactions;
CREATE POLICY "ins_own_cc_tx" ON cc_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ═══ 6. SUBMISSIONS ═══
CREATE TABLE IF NOT EXISTS cc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  evidence_urls text[] DEFAULT '{}',
  evidence_text text,
  evidence_links text[] DEFAULT '{}',
  notes text,
  creator_notes text,
  country text,
  browser text,
  ai_score numeric,
  fraud_score numeric DEFAULT 0,
  ai_verdict text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  reward_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_sub_cmp ON cc_submissions(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_sub_wkr ON cc_submissions(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_sub_st ON cc_submissions(status, created_at DESC);
DROP POLICY IF EXISTS "sel_cc_sub" ON cc_submissions;
CREATE POLICY "sel_cc_sub" ON cc_submissions FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = cc_submissions.campaign_id AND cc_campaigns.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "ins_own_cc_sub" ON cc_submissions;
CREATE POLICY "ins_own_cc_sub" ON cc_submissions FOR INSERT TO authenticated WITH CHECK (worker_id = auth.uid());
DROP POLICY IF EXISTS "upd_cc_sub" ON cc_submissions;
CREATE POLICY "upd_cc_sub" ON cc_submissions FOR UPDATE TO authenticated
  USING (worker_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = cc_submissions.campaign_id AND cc_campaigns.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (true);

-- ═══ 7. SUBMISSION FILES ═══
CREATE TABLE IF NOT EXISTS cc_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES cc_submissions(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image',
  file_name text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_submission_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_sf_sub ON cc_submission_files(submission_id);
DROP POLICY IF EXISTS "sel_cc_sf" ON cc_submission_files;
CREATE POLICY "sel_cc_sf" ON cc_submission_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_submissions WHERE cc_submissions.id = submission_id
    AND (cc_submissions.worker_id = auth.uid()
      OR EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = cc_submissions.campaign_id AND cc_campaigns.creator_id = auth.uid()))));
DROP POLICY IF EXISTS "ins_cc_sf" ON cc_submission_files;
CREATE POLICY "ins_cc_sf" ON cc_submission_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM cc_submissions WHERE cc_submissions.id = submission_id AND cc_submissions.worker_id = auth.uid()));

-- ═══ 8. PROMOTIONS ═══
CREATE TABLE IF NOT EXISTS cc_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_type text NOT NULL,
  budget numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 7,
  target_countries text[] DEFAULT '{}',
  target_categories text[] DEFAULT '{}',
  target_interests text[] DEFAULT '{}',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_promotions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_promo ON cc_promotions(campaign_id);
DROP POLICY IF EXISTS "sel_cc_promo" ON cc_promotions;
CREATE POLICY "sel_cc_promo" ON cc_promotions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ins_own_cc_promo" ON cc_promotions;
CREATE POLICY "ins_own_cc_promo" ON cc_promotions FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
DROP POLICY IF EXISTS "upd_own_cc_promo" ON cc_promotions;
CREATE POLICY "upd_own_cc_promo" ON cc_promotions FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

-- ═══ 9. REVIEWS ═══
CREATE TABLE IF NOT EXISTS cc_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 5,
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_rev_cmp ON cc_reviews(campaign_id);
DROP POLICY IF EXISTS "sel_cc_rev" ON cc_reviews;
CREATE POLICY "sel_cc_rev" ON cc_reviews FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ins_own_cc_rev" ON cc_reviews;
CREATE POLICY "ins_own_cc_rev" ON cc_reviews FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid());

-- ═══ 10. CREATOR PROFILES ═══
CREATE TABLE IF NOT EXISTS cc_creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  total_campaigns integer NOT NULL DEFAULT 0,
  active_campaigns integer NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  approval_speed_hours numeric,
  worker_rating numeric NOT NULL DEFAULT 0,
  refund_rate numeric NOT NULL DEFAULT 0,
  avg_reward numeric NOT NULL DEFAULT 0,
  response_time_hours numeric,
  trust_badge text DEFAULT 'new',
  is_premium boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE cc_creator_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sel_cc_cp" ON cc_creator_profiles;
CREATE POLICY "sel_cc_cp" ON cc_creator_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ins_own_cc_cp" ON cc_creator_profiles;
CREATE POLICY "ins_own_cc_cp" ON cc_creator_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "upd_own_cc_cp" ON cc_creator_profiles;
CREATE POLICY "upd_own_cc_cp" ON cc_creator_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══ 11. WORKER PROFILES ═══
CREATE TABLE IF NOT EXISTS cc_worker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earnings numeric NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  rejected_tasks integer NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  approval_rate numeric NOT NULL DEFAULT 0,
  avg_completion_time_hours numeric,
  level text NOT NULL DEFAULT 'bronze',
  xp integer NOT NULL DEFAULT 0,
  country text,
  skills text[] DEFAULT '{}',
  languages text[] DEFAULT '{}',
  badges text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE cc_worker_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sel_cc_wp" ON cc_worker_profiles;
CREATE POLICY "sel_cc_wp" ON cc_worker_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ins_own_cc_wp" ON cc_worker_profiles;
CREATE POLICY "ins_own_cc_wp" ON cc_worker_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "upd_own_cc_wp" ON cc_worker_profiles;
CREATE POLICY "upd_own_cc_wp" ON cc_worker_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══ 12. WORKER LEVELS ═══
CREATE TABLE IF NOT EXISTS cc_worker_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_name text NOT NULL UNIQUE,
  min_xp integer NOT NULL DEFAULT 0,
  max_xp integer,
  perks jsonb DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_worker_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sel_cc_wl" ON cc_worker_levels;
CREATE POLICY "sel_cc_wl" ON cc_worker_levels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_cc_wl" ON cc_worker_levels;
CREATE POLICY "admin_cc_wl" ON cc_worker_levels FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

INSERT INTO cc_worker_levels (level_name, min_xp, max_xp, sort_order, perks) VALUES
  ('bronze',0,99,1,'["Standard campaigns"]'),
  ('silver',100,499,2,'["Standard campaigns","Priority recommendations"]'),
  ('gold',500,1999,3,'["Higher-paying campaigns","Priority recommendations","Exclusive badges"]'),
  ('diamond',2000,4999,4,'["Higher-paying campaigns","Priority recommendations","Exclusive campaigns","Higher withdrawal limits","Special badges"]'),
  ('elite',5000,19999,5,'["All perks","Exclusive campaigns","Priority review","API access"]'),
  ('legend',20000,NULL,6,'["All perks","Maximum withdrawal limits","Legend badge","VIP support"]')
ON CONFLICT (level_name) DO NOTHING;

-- ═══ 13. BOOKMARKS ═══
CREATE TABLE IF NOT EXISTS cc_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);
ALTER TABLE cc_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_bm_user ON cc_bookmarks(user_id, created_at DESC);
DROP POLICY IF EXISTS "sel_own_cc_bm" ON cc_bookmarks;
CREATE POLICY "sel_own_cc_bm" ON cc_bookmarks FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ins_own_cc_bm" ON cc_bookmarks;
CREATE POLICY "ins_own_cc_bm" ON cc_bookmarks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "del_own_cc_bm" ON cc_bookmarks;
CREATE POLICY "del_own_cc_bm" ON cc_bookmarks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ═══ 14. VIEWS ═══
CREATE TABLE IF NOT EXISTS cc_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_v_cmp ON cc_views(campaign_id, created_at DESC);
DROP POLICY IF EXISTS "ins_cc_v" ON cc_views;
CREATE POLICY "ins_cc_v" ON cc_views FOR INSERT TO authenticated WITH CHECK (true);

-- ═══ 15. CLICKS ═══
CREATE TABLE IF NOT EXISTS cc_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_clicks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_c_cmp ON cc_clicks(campaign_id, created_at DESC);
DROP POLICY IF EXISTS "ins_cc_c" ON cc_clicks;
CREATE POLICY "ins_cc_c" ON cc_clicks FOR INSERT TO authenticated WITH CHECK (true);

-- ═══ 16. ESCROW ═══
CREATE TABLE IF NOT EXISTS cc_escrow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_locked numeric NOT NULL DEFAULT 0,
  amount_released numeric NOT NULL DEFAULT 0,
  amount_refunded numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_escrow ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_esc_cmp ON cc_escrow(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cc_esc_cre ON cc_escrow(creator_id);
DROP POLICY IF EXISTS "sel_cc_esc" ON cc_escrow;
CREATE POLICY "sel_cc_esc" ON cc_escrow FOR SELECT TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "ins_cc_esc" ON cc_escrow;
CREATE POLICY "ins_cc_esc" ON cc_escrow FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
DROP POLICY IF EXISTS "upd_cc_esc" ON cc_escrow;
CREATE POLICY "upd_cc_esc" ON cc_escrow FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (true);

-- ═══ 17. DISPUTES ═══
CREATE TABLE IF NOT EXISTS cc_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES cc_submissions(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolution text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE cc_disputes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_disp_cmp ON cc_disputes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cc_disp_st ON cc_disputes(status);
DROP POLICY IF EXISTS "sel_cc_disp" ON cc_disputes;
CREATE POLICY "sel_cc_disp" ON cc_disputes FOR SELECT TO authenticated
  USING (raised_by = auth.uid() OR EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = campaign_id AND cc_campaigns.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "ins_own_cc_disp" ON cc_disputes;
CREATE POLICY "ins_own_cc_disp" ON cc_disputes FOR INSERT TO authenticated WITH CHECK (raised_by = auth.uid());
DROP POLICY IF EXISTS "admin_cc_disp" ON cc_disputes;
CREATE POLICY "admin_cc_disp" ON cc_disputes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)) WITH CHECK (true);

-- ═══ 18. AI ANALYSIS ═══
CREATE TABLE IF NOT EXISTS cc_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES cc_submissions(id) ON DELETE CASCADE,
  confidence_score numeric NOT NULL DEFAULT 0,
  fraud_score numeric NOT NULL DEFAULT 0,
  verdict text NOT NULL DEFAULT 'pending',
  checks jsonb DEFAULT '[]',
  duplicate_detected boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_ai_analysis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_ai_sub ON cc_ai_analysis(submission_id);
DROP POLICY IF EXISTS "sel_cc_ai" ON cc_ai_analysis;
CREATE POLICY "sel_cc_ai" ON cc_ai_analysis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM cc_submissions WHERE cc_submissions.id = submission_id
    AND (cc_submissions.worker_id = auth.uid()
      OR EXISTS (SELECT 1 FROM cc_campaigns WHERE cc_campaigns.id = cc_submissions.campaign_id AND cc_campaigns.creator_id = auth.uid()))));
DROP POLICY IF EXISTS "ins_cc_ai" ON cc_ai_analysis;
CREATE POLICY "ins_cc_ai" ON cc_ai_analysis FOR INSERT TO authenticated WITH CHECK (true);

-- ═══ 19. CAMPAIGN REPORTS (fraud) ═══
CREATE TABLE IF NOT EXISTS cc_fraud_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_fraud_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_fr_st ON cc_fraud_reports(status);
DROP POLICY IF EXISTS "sel_cc_fr" ON cc_fraud_reports;
CREATE POLICY "sel_cc_fr" ON cc_fraud_reports FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "ins_own_cc_fr" ON cc_fraud_reports;
CREATE POLICY "ins_own_cc_fr" ON cc_fraud_reports FOR INSERT TO authenticated WITH CHECK (reported_by = auth.uid());
DROP POLICY IF EXISTS "admin_cc_fr" ON cc_fraud_reports;
CREATE POLICY "admin_cc_fr" ON cc_fraud_reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)) WITH CHECK (true);

-- ═══ 20. HISTORY ═══
CREATE TABLE IF NOT EXISTS cc_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  action text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_hist_user ON cc_history(user_id, created_at DESC);
DROP POLICY IF EXISTS "sel_own_cc_hist" ON cc_history;
CREATE POLICY "sel_own_cc_hist" ON cc_history FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ins_own_cc_hist" ON cc_history;
CREATE POLICY "ins_own_cc_hist" ON cc_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ═══ 21. NOTIFICATIONS ═══
CREATE TABLE IF NOT EXISTS cc_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_n_user ON cc_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_n_unread ON cc_notifications(user_id, is_read) WHERE is_read = false;
DROP POLICY IF EXISTS "sel_own_cc_n" ON cc_notifications;
CREATE POLICY "sel_own_cc_n" ON cc_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ins_cc_n" ON cc_notifications;
CREATE POLICY "ins_cc_n" ON cc_notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "upd_own_cc_n" ON cc_notifications;
CREATE POLICY "upd_own_cc_n" ON cc_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══ 22. STATS ═══
CREATE TABLE IF NOT EXISTS cc_stats (
  campaign_id uuid PRIMARY KEY REFERENCES cc_campaigns(id) ON DELETE CASCADE,
  total_views integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  total_submissions integer NOT NULL DEFAULT 0,
  total_approved integer NOT NULL DEFAULT 0,
  total_rejected integer NOT NULL DEFAULT 0,
  total_paid_out numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cc_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sel_cc_stats" ON cc_stats;
CREATE POLICY "sel_cc_stats" ON cc_stats FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ins_cc_stats" ON cc_stats;
CREATE POLICY "ins_cc_stats" ON cc_stats FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "upd_cc_stats" ON cc_stats;
CREATE POLICY "upd_cc_stats" ON cc_stats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ═══ 23. SETTINGS (already created by 058c, ensure policies) ═══
DROP POLICY IF EXISTS "select_cc_settings" ON cc_settings;
CREATE POLICY "select_cc_settings" ON cc_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_manage_cc_settings" ON cc_settings;
CREATE POLICY "admin_manage_cc_settings" ON cc_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- ═══ 24. LEADERBOARD ═══
CREATE TABLE IF NOT EXISTS cc_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  avatar_url text,
  total_earnings numeric NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  level text DEFAULT 'bronze',
  country text,
  rank integer,
  period text NOT NULL DEFAULT 'all',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period)
);
ALTER TABLE cc_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cc_lb ON cc_leaderboard(total_earnings DESC) WHERE period = 'all';
DROP POLICY IF EXISTS "sel_cc_lb" ON cc_leaderboard;
CREATE POLICY "sel_cc_lb" ON cc_leaderboard FOR SELECT TO authenticated USING (true);

-- ═══ STORAGE BUCKET ═══
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "campaign_media_upload" ON storage.objects;
CREATE POLICY "campaign_media_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media');
DROP POLICY IF EXISTS "campaign_media_read" ON storage.objects;
CREATE POLICY "campaign_media_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media');
DROP POLICY IF EXISTS "campaign_media_delete" ON storage.objects;
CREATE POLICY "campaign_media_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media');
